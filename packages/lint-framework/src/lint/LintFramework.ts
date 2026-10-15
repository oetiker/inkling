import { closestBox, type IgnorableLintBox } from './Box';
import { isGoogleDocsTarget } from './computeLintBoxes/googleDocsUtilities';
import computeLintBoxes from './computeLintBoxes/index';
import { createTextSpanRangeFinder, isHeading, isVisible } from './domUtils';
import { getCaretPosition, getCMRoot } from './editorUtils';
import Highlights from './Highlights';
import PopupHandler from './PopupHandler';
import { createLintRemapper } from './spanMapping';
import type { LintOptions, Span } from './types';
import type { UnpackedLintGroups } from './unpackLint';

type ActivationKey = 'off' | 'shift' | 'control';

type Modifier = 'Ctrl' | 'Shift' | 'Alt';

type Hotkey = {
	modifiers: Modifier[];
	key: string;
};

type FrameworkActions = {
	ignoreLint?: (hash: string) => Promise<void>;
	getActivationKey?: () => Promise<ActivationKey>;
	getHotkey?: () => Promise<Hotkey>;
	getDelay?: () => Promise<number>;
	openOptions?: () => Promise<void>;
	addToUserDictionary?: (words: string[]) => Promise<void>;
	setRuleEnabled?: (ruleId: string, enabled: boolean) => Promise<void> | void;
};

/** Events on an input (any kind) that can trigger a re-render. */
const INPUT_EVENTS = ['focus', 'keyup', 'keydown', 'paste', 'change', 'scroll', 'input'];
/** Events on the window that can trigger a re-render. */
const PAGE_EVENTS = [
	'resize',
	'scroll',
	'keyup',
	'keydown',
	'input',
	'compositionend',
	'selectionchange',
];

/** Orchestrates linting and rendering in response to events on the page. */
export default class LintFramework {
	private highlights: Highlights;
	private popupHandler: PopupHandler;
	private targets: Set<Node>;
	/** The mutation observer watching each target. */
	private targetObservers: Map<Node, MutationObserver> = new Map();
	/** The scrollable ancestors that got a scroll listener for each target. */
	private targetScrollAncestors: Map<Node, HTMLElement[]> = new Map();
	/** How many targets need the scroll listener on each scrollable ancestor. */
	private scrollableAncestors: Map<HTMLElement, number>;
	private lintRequest: Promise<unknown> | null = null;
	private renderRequested = false;
	private lintDelayTimer: number | null = null;
	private pollTimer: number | null = null;
	private hotkeyListener: ((event: KeyboardEvent) => void) | null = null;
	/** Set by `shutdown`; nothing runs or renders after it. */
	private stopped = false;
	private lastInputAt = 0;
	private lastLints: { target: HTMLElement; lints: UnpackedLintGroups }[] = [];
	private lastBoxes: IgnorableLintBox[] = [];
	private lastLintBoxes: IgnorableLintBox[] = [];

	/** The function to be called to re-render the highlights. This is a variable because it is used to register/deregister event listeners. */
	private updateEventCallback: () => void;

	/** Function used to fetch lints for a given text/domain. */
	private lintProvider: (
		text: string,
		domain: string,
		options?: LintOptions,
	) => Promise<UnpackedLintGroups>;
	/** Actions wired by host environment (extension/app). */
	private actions: FrameworkActions;

	constructor(
		lintProvider: (
			text: string,
			domain: string,
			options?: LintOptions,
		) => Promise<UnpackedLintGroups>,
		actions: FrameworkActions,
	) {
		this.lintProvider = lintProvider;
		this.actions = actions;
		this.highlights = new Highlights();
		this.popupHandler = new PopupHandler({
			getActivationKey: actions.getActivationKey,
			openOptions: actions.openOptions,
			addToUserDictionary: actions.addToUserDictionary,
			setRuleEnabled: actions.setRuleEnabled,
		});
		this.targets = new Set();
		this.scrollableAncestors = new Map();
		this.lastLints = [];

		this.updateEventCallback = () => {
			this.lastInputAt = Date.now();
			this.update();
		};

		// Catches edge cases where editors do not correctly emit events.
		const timeoutCallback = () => {
			this.update();

			// The update can find the extension gone and shut down.
			if (!this.stopped) {
				this.pollTimer = window.setTimeout(timeoutCallback, 1000);
			}
		};
		timeoutCallback();

		this.attachWindowListeners();
	}

	/** Returns the currents targets that are visible on-screen. */
	onScreenTargets(): Node[] {
		const onScreen = [] as Node[];

		for (const target of this.targets) {
			if (isVisible(target)) {
				onScreen.push(target);
			}
		}

		return onScreen;
	}

	async update() {
		if (this.stopped) {
			return;
		}
		this.requestRender();
		this.requestLintUpdate();
	}

	async requestLintUpdate(immediate = false): Promise<void> {
		const delay = (await this.actions.getDelay?.()) ?? 0;
		if (this.stopped) {
			return;
		}
		const remainingDelay = delay - (Date.now() - this.lastInputAt);

		// Extend the delay if there is one in effect (this is the debounce behavior).
		if (!immediate && delay > 0 && remainingDelay > 0) {
			if (this.lintDelayTimer != null) {
				window.clearTimeout(this.lintDelayTimer);
			}

			this.lintDelayTimer = window.setTimeout(() => {
				this.lintDelayTimer = null;
				this.requestLintUpdate();
			}, remainingDelay);
			return;
		}

		if (this.lintDelayTimer != null) {
			window.clearTimeout(this.lintDelayTimer);
			this.lintDelayTimer = null;
		}

		if (this.lintRequest != null) {
			if (!immediate) {
				return;
			}

			// An immediate refresh must run after the current request. Running them concurrently
			// allows an older result to finish last and redraw a lint that was just ignored.
			try {
				await this.lintRequest;
			} catch {
				// Still attempt the explicitly requested refresh after a failed background request.
			}
			await this.requestLintUpdate(true);
			return;
		}

		this.dropDetachedTargets();

		if (this.targets.size !== 0) {
			const request = Promise.all(
				this.onScreenTargets().map(async (target) => {
					const { text, isCM, newLineIndices } = this.getTargetText(target);

					if (!text || text.length > 120000) {
						return { target: null as HTMLElement | null, lints: {} };
					}

					const language = getTargetLanguage(target);
					let lintsBySource = await this.lintProvider(text, window.location.hostname, {
						forceAllHeadings: isHeading(target),
						language,
					});

					if (isCM) {
						// We're about to modify a reference, so let's work on a copy.
						lintsBySource = window.structuredClone(lintsBySource);

						for (const lints of Object.values(lintsBySource)) {
							for (const lint of lints) {
								const offset_start = newLineIndices.findIndex((i) => i > lint.span.start);
								const offset_end = newLineIndices.findIndex((i) => i > lint.span.end);

								lint.span.start -= offset_start;
								lint.span.end -= offset_end;
							}
						}
					}

					return { target: target as HTMLElement, lints: lintsBySource };
				}),
			);

			this.lintRequest = request;
			const lintResults = await request.finally(() => {
				if (this.lintRequest === request) {
					this.lintRequest = null;
				}
			});
			if (this.stopped) {
				return;
			}
			this.lastLints = lintResults.filter((r) => r.target != null) as any;
			this.requestRender();
		}
	}

	/**
	 * Hotkey to apply the suggestion of the most likely word
	 */
	public async lintHotkey() {
		const hotkey = await this.actions.getHotkey?.();
		if (this.stopped) {
			return;
		}

		this.hotkeyListener = (event: KeyboardEvent) => {
			if (!hotkey) return;

			const key = event.key.toLowerCase();
			const expectedKey = hotkey.key.toLowerCase();

			const hasCtrl = event.ctrlKey === hotkey.modifiers.includes('Ctrl');
			const hasAlt = event.altKey === hotkey.modifiers.includes('Alt');
			const hasShift = event.shiftKey === hotkey.modifiers.includes('Shift');

			const match = key === expectedKey && hasCtrl && hasAlt && hasShift;

			if (match) {
				event.preventDefault();
				event.stopImmediatePropagation();

				const caretPosition = getCaretPosition();

				if (caretPosition != null) {
					const closestIdx = closestBox(caretPosition, this.lastBoxes);

					if (closestIdx < 0) {
						return;
					}

					const previousBox = this.lastBoxes[closestIdx];
					const suggestions = previousBox.lint.suggestions;
					if (suggestions.length > 0) {
						previousBox.applySuggestion(suggestions[0]);
					} else {
						previousBox.ignoreLint?.();
					}
				}
			}
		};
		document.addEventListener('keydown', this.hotkeyListener, { capture: true });
	}

	public async addTarget(target: Node) {
		if (!this.stopped && !this.targets.has(target)) {
			this.targets.add(target);
			this.update();
			this.attachTargetListeners(target);
		}
	}

	public async removeTarget(target: Node) {
		if (this.targets.has(target)) {
			this.targets.delete(target);
			this.update();
			this.detachTargetListeners(target);
		} else {
			throw new Error('HTMLElement not added.');
		}
	}

	/**
	 * Stop for good: remove every listener, observer, timer and mark this framework added,
	 * leaving the page as it was before. Used once the extension that runs it is gone.
	 */
	public shutdown() {
		if (this.stopped) {
			return;
		}
		this.stopped = true;

		if (this.pollTimer != null) {
			window.clearTimeout(this.pollTimer);
		}
		if (this.lintDelayTimer != null) {
			window.clearTimeout(this.lintDelayTimer);
		}
		for (const event of PAGE_EVENTS) {
			window.removeEventListener(event, this.updateEventCallback);
		}
		if (this.hotkeyListener != null) {
			document.removeEventListener('keydown', this.hotkeyListener, { capture: true });
		}
		for (const target of this.targets) {
			this.detachTargetListeners(target);
		}
		this.targets.clear();

		this.lastLints = [];
		this.lastBoxes = [];
		this.lastLintBoxes = [];
		this.popupHandler.dispose();
		this.highlights.dispose();
	}

	/** Return the last known ignorable lint boxes rendered on-screen. */
	public getLastIgnorableLintBoxes(): IgnorableLintBox[] {
		return this.lastLintBoxes;
	}

	/**
	 * Forget the targets the page has removed, with their listeners and observers.
	 * A target the page puts back is found again by the next scan.
	 */
	private dropDetachedTargets() {
		for (const target of this.targets) {
			if (!target.isConnected) {
				this.targets.delete(target);
				this.detachTargetListeners(target);
			}
		}
	}

	private attachTargetListeners(target: Node) {
		for (const event of INPUT_EVENTS) {
			target.addEventListener(event, this.updateEventCallback);
		}

		const observer = new MutationObserver(this.updateEventCallback);
		const config = { subtree: true, characterData: true };

		if ((target as any).tagName == undefined) {
			observer.observe((target as any).parentElement!, config);
		} else {
			observer.observe(target as Element, config);
		}
		this.targetObservers.set(target, observer);

		const scrollableAncestors = getScrollableAncestors(target) as HTMLElement[];
		this.targetScrollAncestors.set(target, scrollableAncestors);

		for (const el of scrollableAncestors) {
			const users = this.scrollableAncestors.get(el) ?? 0;
			if (users === 0) {
				el.addEventListener('scroll', this.updateEventCallback, {
					capture: true,
					passive: true,
				});
			}
			this.scrollableAncestors.set(el, users + 1);
		}
	}

	private detachTargetListeners(target: Node) {
		for (const event of INPUT_EVENTS) {
			target.removeEventListener(event, this.updateEventCallback);
		}

		this.targetObservers.get(target)?.disconnect();
		this.targetObservers.delete(target);

		// The ancestors recorded at attach time, since a detached target has none left.
		for (const el of this.targetScrollAncestors.get(target) ?? []) {
			const users = (this.scrollableAncestors.get(el) ?? 0) - 1;
			if (users > 0) {
				this.scrollableAncestors.set(el, users);
			} else {
				this.scrollableAncestors.delete(el);
				el.removeEventListener('scroll', this.updateEventCallback, { capture: true });
			}
		}
		this.targetScrollAncestors.delete(target);
	}

	private attachWindowListeners() {
		this.lintHotkey();
		for (const event of PAGE_EVENTS) {
			window.addEventListener(event, this.updateEventCallback);
		}
	}

	private getTargetText(target: Node): {
		text: string | null;
		isCM: boolean;
		newLineIndices: number[];
	} {
		let text: string | null = null;

		// Check if it is a CodeMirror instance, which needs to be handled in a specific way.
		const isCM = target instanceof HTMLElement && getCMRoot(target) != null;

		if (isCM) {
			const lineElements = (target as HTMLElement).querySelectorAll<HTMLElement>('.cm-line');
			const lines = Array.from(lineElements).map((el) => el.textContent);
			text = lines.reduce((acc: string, x: string | null) => `${acc}${x ?? ''}\n`, '');
		} else if (target instanceof HTMLElement && isGoogleDocsTarget(target)) {
			// The mirror already contains logical whitespace. innerText inserts line breaks
			// between its positioned spans, splitting sentences at formatting boundaries.
			text = target.textContent;
		} else {
			text =
				target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
					? target.value
					: (target as HTMLElement).innerText;
		}

		const newLineIndices: number[] = [];
		let i = 0;
		for (const c of text ?? '') {
			if (c == '\n') {
				newLineIndices.push(i);
			}
			i++;
		}

		return { text, isCM, newLineIndices };
	}

	private requestRender() {
		if (this.renderRequested) {
			return;
		}

		this.renderRequested = true;

		requestAnimationFrame(() => {
			if (this.stopped) {
				return;
			}

			const boxes = this.lastLints.flatMap(({ target, lints }) => {
				if (!target) {
					return [];
				}

				const { text, isCM } = this.getTargetText(target);
				if (text == null) {
					return [];
				}

				// Both walk the whole text or DOM, so do it once per target, not once per lint.
				const remap = createLintRemapper(text);
				let findRange: ((span: Span) => Range | null) | undefined;
				const findRangeOnce = (span: Span) => {
					findRange ??= createTextSpanRangeFinder(target);
					return findRange(span);
				};

				return Object.entries(lints).flatMap(([ruleName, ls]) =>
					ls.flatMap((lint) => {
						const currentLint = isCM ? (lint.source === text ? lint : null) : remap(lint);
						if (currentLint == null) {
							return [];
						}

						return computeLintBoxes(target, currentLint, ruleName, {
							findRange: findRangeOnce,
							ignoreLint: this.actions.ignoreLint
								? async (hash: string) => {
										await this.actions.ignoreLint?.(hash);
										await this.requestLintUpdate(true);
									}
								: undefined,
						});
					}),
				);
			});
			this.lastLintBoxes = boxes;
			this.highlights.renderLintBoxes(boxes);
			this.popupHandler.updateLintBoxes(boxes);

			this.renderRequested = false;
			this.lastBoxes = boxes;
		});
	}
}

/**
 * Returns all scrollable ancestor elements of a given element,
 * ordered from nearest to furthest (ending with the page scroller).
 */
function getScrollableAncestors(element: Node): Element[] {
	const scrollables: Element[] = [];
	const root = document.scrollingElement || document.documentElement;
	let parent = (element as any).parentElement;

	while (parent) {
		const style = window.getComputedStyle(parent);
		const { overflowY, overflowX } = style;
		const canScrollY = overflowY.includes('auto') || overflowY.includes('scroll');
		const canScrollX = overflowX.includes('auto') || overflowX.includes('scroll');

		if (canScrollY || canScrollX) {
			scrollables.push(parent);
		}
		parent = parent.parentElement;
	}

	// Always include the document scroller at the end
	if (root && scrollables[scrollables.length - 1] !== root) {
		scrollables.push(root);
	}

	return scrollables;
}

function getTargetLanguage(target: Node): LintOptions['language'] | undefined {
	if (!(target instanceof Element)) return undefined;

	const language = target.getAttribute('data-language');
	switch (language) {
		case 'plaintext':
		case 'markdown':
		case 'typst':
			return language;
		default:
			return undefined;
	}
}
