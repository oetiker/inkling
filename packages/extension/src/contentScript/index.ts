import {
	getClosestBlockAncestor,
	isVisible,
	LintFramework,
	leafNodes,
	removeLeftoverMarks,
} from 'lint-framework';
import isSubstack from '../isSubstack';
import isWordPress from '../isWordPress';
import ProtocolClient from '../ProtocolClient';
import { createGoogleDocsBridgeSync, isGoogleDocsPage } from './googleDocs';
import { pageStartTime } from './pageStart';

if (isWordPress() || isSubstack()) {
	ProtocolClient.setDomainEnabled(window.location.hostname, true, false);
}

// Firefox keeps the marks of the instance that ran before an extension reload or update.
removeLeftoverMarks();

/** The check delay, asked for once and again after the setting changed. */
let delay: Promise<number> | null = null;

function getDelay(): Promise<number> {
	if (delay == null) {
		const request = ProtocolClient.getDelay();
		// Ask again next time rather than keep a failed answer.
		request.catch(() => {
			if (delay === request) delay = null;
		});
		delay = request;
	}
	return delay;
}

/** Whether checking is on for this page, asked for once and again after a setting changed. */
let active: Promise<boolean> | null = null;

function isActive(): Promise<boolean> {
	if (active == null) {
		const request = ProtocolClient.isActive(window.location.hostname);
		request.catch(() => {
			if (active === request) active = null;
		});
		active = request;
	}
	return active;
}

/** Run `action` if checking is on for this page. */
function whenActive(action: () => void) {
	isActive().then(
		(on) => {
			if (on && !stopped) action();
		},
		() => {},
	);
}

// The options page stores the delay, and the next check in an open tab must use it.
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === 'local' && 'delay' in changes) {
		delay = null;
	}
});

const fw = new LintFramework(
	(text, domain, options) => ProtocolClient.lint(text, domain, options),
	{
		ignoreLint: (hash) => ProtocolClient.ignoreHash(hash),
		getActivationKey: () => ProtocolClient.getActivationKey(),
		getHotkey: () => ProtocolClient.getHotkey(),
		getDelay,
		isActive,
		openOptions: () => ProtocolClient.openOptions(),
		addToUserDictionary: (words) => ProtocolClient.addToUserDictionary(words),
		setRuleEnabled: async (ruleId, enabled) => {
			await ProtocolClient.setRuleEnabled(ruleId, enabled);
			fw.update();
		},
	},
);

// The background asks for this after a site, default or pause setting changed.
// LintFramework re-checks every second; with the caches gone it asks the background again.
chrome.runtime.onMessage.addListener((message: { kind?: string }) => {
	if (message?.kind === 'refresh') {
		ProtocolClient.clearCache();
		active = null;
		applyActive();
	}
});

// A new document in this tab ends a pause the user set for it.
// A prerendered page counts from its activation, a page restored from the back/forward
// cache from its restore; both reuse this script without running it again.
if (window === window.top) {
	if ((document as Document & { prerendering?: boolean }).prerendering) {
		document.addEventListener(
			'prerenderingchange',
			() => void ProtocolClient.pageStarted(Date.now()),
			{
				once: true,
			},
		);
	} else {
		const navigation = performance.getEntriesByType('navigation')[0] as
			| (PerformanceNavigationTiming & { activationStart?: number })
			| undefined;
		void ProtocolClient.pageStarted(
			pageStartTime(Date.now(), performance.now(), navigation?.activationStart ?? 0),
		);
	}
	window.addEventListener('pageshow', onPageShow);
}

function onPageShow(event: PageTransitionEvent) {
	if (event.persisted) {
		void ProtocolClient.pageStarted(Date.now());
	}
}

const googleDocsBridge = createGoogleDocsBridgeSync(fw);
const syncGoogleDocsBridge = googleDocsBridge.sync;

let stopped = false;
let keepAliveTimer: number | undefined;
const keepAliveCallback = () => {
	ProtocolClient.lint('', 'example.com', {});
	whenActive(syncGoogleDocsBridge);

	// The request above can find the extension gone and shut down.
	if (!stopped) {
		keepAliveTimer = window.setTimeout(keepAliveCallback, 400);
	}
};

keepAliveCallback();

/**
 * Returns the reasons Inkling should skip this textarea while scanning for targets.
 * An empty array means the textarea is eligible to be added.
 */
function getTextareaReasons(element: HTMLTextAreaElement, requireVisible: boolean): string[] {
	const reasons = [];

	if (requireVisible && !isVisible(element)) {
		reasons.push('not-visible');
	}

	if (element.getAttribute('data-enable-grammarly') === 'false') {
		reasons.push('grammarly-disabled');
	}

	if (element.disabled) {
		reasons.push('disabled');
	}

	if (element.readOnly) {
		reasons.push('readonly');
	}

	return reasons;
}

function maybeAddTextareaTarget(element: HTMLTextAreaElement, requireVisible: boolean) {
	const reasons = getTextareaReasons(element, requireVisible);
	if (reasons.length > 0) {
		return;
	}

	fw.addTarget(element);
}

/** Look for text fields to check, unless checking is off for this page. */
function scan() {
	whenActive(addTargets);
}

/** Look for text fields if checking is on, or let go of all of them if it is off. */
function applyActive() {
	isActive().then(
		(on) => {
			if (stopped) return;
			if (on) {
				addTargets();
			} else {
				googleDocsBridge.stop();
				fw.removeAllTargets();
			}
		},
		() => {},
	);
}

function addTargets() {
	void syncGoogleDocsBridge();

	if (isGoogleDocsPage()) {
		return;
	}

	document.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((element) => {
		maybeAddTextareaTarget(element, true);
	});

	document
		.querySelectorAll<HTMLInputElement>('input[type="text"][spellcheck="true"]')
		.forEach((element) => {
			if (element.disabled || element.readOnly) {
				return;
			}

			fw.addTarget(element);
		});

	document
		.querySelectorAll('[data-testid="gutenberg-editor"], .block-editor-iframe__body')
		.forEach((element) => {
			const leafs = leafNodes(element);

			const seenBlockContainers = new Set<Element>();

			for (const leaf of leafs) {
				const blockContainer = getClosestBlockAncestor(leaf, element);

				if (!blockContainer || seenBlockContainers.has(blockContainer)) {
					continue;
				}

				seenBlockContainers.add(blockContainer);

				if (!isVisible(blockContainer)) {
					continue;
				}

				fw.addTarget(blockContainer);
			}
		});

	document
		.querySelectorAll<HTMLElement>('.cm-editor .cm-content[contenteditable="true"]')
		.forEach((element) => {
			const isTypstPlayground = window.location.hostname === 'typst.app';
			const explicitlyTypst = element.getAttribute('data-language') === 'typst';

			if (!isTypstPlayground && !explicitlyTypst) {
				return;
			}

			if (element.closest('[contenteditable="false"],[disabled],[readonly]') != null) {
				return;
			}

			if (!isVisible(element)) {
				return;
			}

			element.setAttribute('data-language', 'typst');
			fw.addTarget(element);
		});

	document.querySelectorAll('[contenteditable="true"],[contenteditable]').forEach((element) => {
		if (element.classList.contains('cm-content') && element.closest('.cm-editor') != null) {
			return;
		}

		const isLexicalEditor = element.getAttribute('data-lexical-editor') === 'true';
		// Slack's message compose box (Quill-based) sets spellcheck="false" and provides its own
		// spelling/autocomplete UI, but otherwise behaves like a normal rich-text contenteditable
		// editor, so treat it the same way we treat Lexical editors: don't skip it purely because
		// spellcheck is disabled.
		const isQuillEditor = element.classList.contains('ql-editor');

		if (
			element.matches('[role="combobox"]') ||
			element.getAttribute('data-enable-grammarly') === 'false' ||
			(element.getAttribute('spellcheck') === 'false' &&
				!isLexicalEditor &&
				!isQuillEditor &&
				element.getAttribute('data-language') !== 'markdown')
		) {
			return;
		}

		if (element.classList.contains('ck-editor__editable')) {
			element.querySelectorAll('p').forEach((paragraph) => {
				if (paragraph.closest('[contenteditable="false"],[disabled],[readonly]') != null) {
					return;
				}

				if (!isVisible(paragraph)) {
					return;
				}

				fw.addTarget(paragraph);
			});

			return;
		}

		const leafs = leafNodes(element);

		const seenBlockContainers = new Set<Element>();

		for (const leaf of leafs) {
			if (leaf.parentElement?.closest('[contenteditable="false"],[disabled],[readonly]') != null) {
				continue;
			}

			const blockContainer = getClosestBlockAncestor(leaf, element);

			if (!blockContainer || seenBlockContainers.has(blockContainer)) {
				continue;
			}

			seenBlockContainers.add(blockContainer);

			if (!isVisible(blockContainer)) {
				continue;
			}

			fw.addTarget(blockContainer);
		}
	});
}

function onFocusIn(event: FocusEvent) {
	const target = event.target;
	if (!(target instanceof HTMLTextAreaElement)) {
		return;
	}

	whenActive(() => maybeAddTextareaTarget(target, false));
}

scan();
const scanObserver = new MutationObserver(scan);
scanObserver.observe(document.body, {
	childList: true,
	subtree: true,
});

document.addEventListener('focusin', onFocusIn, { capture: true });

const lateScanTimer = window.setTimeout(scan, 1000);

// After the extension is reloaded, updated or turned off, Chrome leaves this script
// running in open tabs without a background to talk to. Leave the page as it was.
ProtocolClient.onContextLost(() => {
	stopped = true;
	window.clearTimeout(keepAliveTimer);
	window.clearTimeout(lateScanTimer);
	scanObserver.disconnect();
	document.removeEventListener('focusin', onFocusIn, { capture: true });
	window.removeEventListener('pageshow', onPageShow);
	googleDocsBridge.dispose();
	fw.shutdown();
});
