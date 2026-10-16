import { h } from 'virtual-dom';
import type { Box, IgnorableLintBox } from './Box';
import { lintKindColor } from './lintKindColor';
import { RENDER_BOX_TAG } from './RenderBox';
import { SuggestionKind } from './types';
import type { UnpackedSuggestion } from './unpackLint';

/** Distance between the marked word and the card. */
const ANCHOR_GAP = 6;
const VIEWPORT_MARGIN = 8;

// Outline icons from Lucide (https://lucide.dev, ISC license), the set shadcn-svelte uses.
const ICON_ATTRS =
	'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_X = `<svg ${ICON_ATTRS}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const ICON_BOOK_PLUS = `<svg ${ICON_ATTRS}><path d="M12 7v6"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M9 10h6"/></svg>`;
const ICON_BAN = `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/></svg>`;
const ICON_SETTINGS = `<svg ${ICON_ATTRS}><path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>`;

/** The card's texts, so that the page showing it can supply them in its own language. */
export type SuggestionBoxText = {
	/** The name of the group of suggestion buttons. */
	suggestions: string;
	ignore: string;
	close: string;
	addToDictionary: string;
	disableRule: (ruleId: string) => string;
	settings: string;
	/** The label of a suggestion that removes the marked text. */
	remove: string;
	/** The label of a suggestion that inserts an empty text. */
	insert: string;
	replaceTitle: (original: string, replacement: string) => string;
	removeTitle: (original: string) => string;
	insertAfterTitle: (insertion: string, original: string) => string;
};

export const ENGLISH_SUGGESTION_BOX_TEXT: SuggestionBoxText = {
	suggestions: 'Suggestions',
	ignore: 'Ignore',
	close: 'Close',
	addToDictionary: 'Add to dictionary',
	disableRule: (ruleId) => `Disable rule ${ruleId}`,
	settings: 'Settings',
	remove: 'Remove',
	insert: 'Insert',
	replaceTitle: (original, replacement) => `Replace "${original}" with "${replacement}"`,
	removeTitle: (original) => `Remove "${original}"`,
	insertAfterTitle: (insertion, original) => `Insert "${insertion}" after "${original}"`,
};

export type SuggestionBoxActions = {
	openOptions?: () => Promise<void>;
	addToUserDictionary?: (words: string[]) => Promise<void>;
	setRuleEnabled?: (ruleId: string, enabled: boolean) => Promise<void> | void;
	/** The card's texts; English when not given. */
	text?: SuggestionBoxText;
};

export type SuggestionBoxProps = {
	box: IgnorableLintBox;
	selectedIndex: number;
	onSelect: (index: number) => void;
	/** Move the keyboard into the card. False when it opens from a click, so the caret stays in the text. */
	focus: boolean;
	/** Optional consumer capabilities; the card never persists configuration itself. */
	actions: SuggestionBoxActions;
	close: () => void;
};

/** Saved cursor restore function, captured only when the card takes the focus. */
let savedRestore: (() => void) | null = null;

function saveCursorState() {
	savedRestore = null;
	const el = document.activeElement;
	if (!el || el === document.body || el.tagName.toLowerCase() === RENDER_BOX_TAG) return;

	if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
		const start = el.selectionStart;
		const end = el.selectionEnd;
		const dir = el.selectionDirection ?? undefined;
		savedRestore =
			start != null
				? () => {
						el.focus({ preventScroll: true });
						el.setSelectionRange(start, end, dir);
					}
				: () => el.focus({ preventScroll: true });
	} else if (el instanceof HTMLElement) {
		const sel = window.getSelection();
		const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
		savedRestore = () => {
			el.focus({ preventScroll: true });
			if (range) {
				const s = window.getSelection();
				if (s) {
					s.removeAllRanges();
					s.addRange(range);
				}
			}
		};
	}
}

/** Defer restoration until the closing key event has finished dispatching. */
function restoreCursorState() {
	const restore = savedRestore;
	savedRestore = null;
	if (!restore) return;
	setTimeout(() => {
		try {
			restore();
		} catch {
			// A host editor may have replaced the saved selection's DOM nodes.
		}
	}, 0);
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}

/**
 * Place the card below the marked word, or above it when there is no room
 * below, and keep it inside the viewport. Inputs and outputs are CSS pixels.
 */
export function popupPosition(
	anchor: Box,
	viewport: { width: number; height: number },
	card: { width: number; height: number },
) {
	const margin = VIEWPORT_MARGIN;
	const below = anchor.y + anchor.height + ANCHOR_GAP;
	const flipped = below + card.height + margin > viewport.height;
	const top = clamp(
		flipped ? anchor.y - card.height - ANCHOR_GAP : below,
		margin,
		viewport.height - card.height - margin,
	);
	const left = clamp(anchor.x, margin, viewport.width - card.width - margin);
	return { top, left, flipped };
}

/**
 * virtual-dom only recognizes hooks inherited from a prototype. This functional
 * adapter pairs each DOM setup with cleanup on replacement or removal.
 */
function domHook(setup: (node: HTMLElement) => () => void) {
	let cleanup: (() => void) | undefined;
	let frame: number;
	return Object.create({
		hook(node: HTMLElement) {
			if (node.isConnected) {
				cleanup = setup(node);
			} else {
				// Creation hooks run before the node's children have been appended.
				frame = requestAnimationFrame(() => {
					if (node.isConnected) cleanup = setup(node);
				});
			}
		},
		unhook() {
			cancelAnimationFrame(frame);
			cleanup?.();
		},
	});
}

/**
 * Measure after attachment and on card or viewport resize. Take the focus at
 * most once per card lifetime, and only when asked to.
 */
function popupHook(props: SuggestionBoxProps, refocusClose: () => void) {
	return domHook((node) => {
		const measure = () => {
			if (!node.isConnected) return;
			const position = popupPosition(
				props.box,
				{ width: window.innerWidth, height: window.innerHeight },
				{ width: node.offsetWidth, height: node.offsetHeight },
			);
			node.style.top = `${position.top}px`;
			node.style.left = `${position.left}px`;
			node.style.transformOrigin = `${position.flipped ? 'bottom' : 'top'} left`;
			node.style.visibility = 'visible';
		};
		const frame = requestAnimationFrame(() => {
			if (!node.isConnected) return;
			measure();
			if (props.focus && !node.dataset.focused) {
				saveCursorState();
				node.dataset.focused = 'true';
				focusSuggestion(node, props.selectedIndex);
			}
		});
		const onEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			refocusClose();
		};
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		window.addEventListener('resize', measure);
		window.addEventListener('keydown', onEscape, true);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			window.removeEventListener('resize', measure);
			window.removeEventListener('keydown', onEscape, true);
		};
	});
}

/** Focus a suggestion, or the first button when there are no suggestions. */
export function focusSuggestion(root: ParentNode, index: number) {
	const target =
		root.querySelector<HTMLElement>(`#inkling-suggestion-${index}`) ??
		root.querySelector<HTMLElement>('button');
	target?.focus({ preventScroll: true });
}

function suggestionLabel(suggestion: UnpackedSuggestion, text: SuggestionBoxText) {
	if (suggestion.replacement_text) return suggestion.replacement_text;
	return suggestion.kind === SuggestionKind.Remove ? text.remove : text.insert;
}

/** Describe the actual edit, rather than just repeating the button's label. */
function suggestionTitle(
	suggestion: UnpackedSuggestion,
	original: string,
	text: SuggestionBoxText,
): string {
	switch (suggestion.kind) {
		case SuggestionKind.Replace:
			return text.replaceTitle(original, suggestion.replacement_text);
		case SuggestionKind.Remove:
			return text.removeTitle(original);
		case SuggestionKind.InsertAfter:
			return text.insertAfterTitle(suggestion.replacement_text, original);
	}
}

/** A button that never takes the focus from the editor when clicked with the mouse. */
function button(
	className: string,
	onClick: () => void,
	props: Record<string, unknown>,
	label?: string,
) {
	return h(
		'button',
		{
			type: 'button',
			className,
			onclick: onClick,
			onmousedown: (event: MouseEvent) => event.preventDefault(),
			...props,
		},
		label ?? [],
	);
}

function iconButton(label: string, svg: string, onClick: () => void, className = 'inkling-icon') {
	return button(className, onClick, {
		title: label,
		attributes: { 'aria-label': label },
		innerHTML: svg,
	});
}

const STYLE = `
.inkling-popup, .inkling-popup * { box-sizing:border-box; }
.inkling-popup {
 position:fixed; z-index:5000; visibility:hidden; pointer-events:auto;
 width:min(280px, calc(100vw - 16px)); max-height:min(400px, calc(100vh - 16px)); overflow-y:auto; overscroll-behavior:contain;
 padding:8px 8px 6px 10px; text-align:left;
 background:#ffffff; color:#1f2328; border:1px solid #e1e4e8; border-radius:8px;
 box-shadow:0 4px 16px rgba(31,35,40,0.14), 0 1px 3px rgba(31,35,40,0.08);
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
 font-size:13px; line-height:1.4;
}
.inkling-popup button { font-family:inherit; cursor:pointer; }
.inkling-head { display:flex; align-items:center; gap:6px; margin-bottom:2px; font-size:11px; color:#6e7781; }
.inkling-kind { flex:1; min-width:0; overflow-wrap:anywhere; }
.inkling-dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
.inkling-message { margin:0 0 8px; font-size:12.5px; color:#3d444d; overflow-wrap:anywhere; }
.inkling-message p { margin:0; }
.inkling-message p + p { margin-top:6px; }
.inkling-suggestions { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px; }
.inkling-suggestion {
 max-width:100%; padding:1px 9px; border:1px solid #d0d7de; border-radius:6px;
 background:#ffffff; color:inherit; font-size:13px; font-weight:600; line-height:1.4; text-align:left;
 white-space:pre-wrap; overflow-wrap:anywhere;
}
.inkling-suggestion:first-child { background:#f6f8fa; }
.inkling-suggestion:hover { border-color:#8c959f; }
.inkling-bar { display:flex; justify-content:flex-end; gap:2px; padding-top:4px; border-top:1px solid #f0f2f4; }
.inkling-icon {
 display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto;
 width:26px; height:26px; padding:0; border:0; border-radius:6px; background:transparent; color:#6e7781;
}
.inkling-icon:hover { background:#f0f2f4; color:#1f2328; }
.inkling-icon svg { display:block; width:16px; height:16px; }
.inkling-close { width:22px; height:22px; margin:-4px -2px 0 0; }
.inkling-close svg { width:15px; height:15px; }
.inkling-popup button:focus-visible { outline:2px solid #0969da; outline-offset:-2px; }
@media (prefers-color-scheme:dark) {
 .inkling-popup { background:#161b22; color:#e6edf3; border-color:#30363d; box-shadow:0 6px 20px rgba(1,4,9,0.7); }
 .inkling-head, .inkling-icon { color:#8b949e; }
 .inkling-message { color:#9aa4af; }
 .inkling-suggestion { background:#161b22; border-color:#30363d; }
 .inkling-suggestion:first-child { background:#21262d; }
 .inkling-suggestion:hover { border-color:#6e7681; }
 .inkling-bar { border-top-color:#21262d; }
 .inkling-icon:hover { background:#21262d; color:#e6edf3; }
 .inkling-popup button:focus-visible { outline-color:#58a6ff; }
}
`;

/** Render one lint as a compact card: category, explanation, suggestions and actions. */
export default function SuggestionBox(props: SuggestionBoxProps) {
	const { box, actions, close } = props;
	const lint = box.lint;
	const suggestions = lint.suggestions;
	const text = actions.text ?? ENGLISH_SUGGESTION_BOX_TEXT;
	const refocusClose = () => {
		restoreCursorState();
		close();
	};
	const runAndClose = (action: () => void | Promise<void>) => {
		void Promise.resolve().then(action).catch(console.error).finally(refocusClose);
	};
	const apply = (suggestion: UnpackedSuggestion) => {
		// Applying owns the new caret position; never restore the pre-edit selection.
		savedRestore = null;
		void Promise.resolve()
			.then(() => box.applySuggestion(suggestion))
			.catch(console.error)
			.finally(close);
	};
	const onKeyDown = (event: KeyboardEvent) => {
		const target = event.target as HTMLElement;
		if (!target.classList.contains('inkling-suggestion') || suggestions.length === 0) return;
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
		if (step == null) return;
		event.preventDefault();
		event.stopPropagation();
		const index = (props.selectedIndex + step + suggestions.length) % suggestions.length;
		props.onSelect(index);
		focusSuggestion(event.currentTarget as HTMLElement, index);
	};

	const head = h('div', { className: 'inkling-head' }, [
		h(
			'span',
			{
				className: 'inkling-dot',
				style: { background: lintKindColor(lint.lint_kind) },
				attributes: { 'aria-hidden': 'true' },
			},
			[],
		),
		h('span', { id: 'inkling-kind', className: 'inkling-kind' }, lint.lint_kind_pretty),
		box.ignoreLint
			? iconButton(
					text.ignore,
					ICON_X,
					() => runAndClose(box.ignoreLint!),
					'inkling-icon inkling-close',
				)
			: iconButton(text.close, ICON_X, refocusClose, 'inkling-icon inkling-close'),
	]);

	const suggestionButtons = suggestions.map((suggestion, index) => {
		// A stable key preserves keyboard focus when earlier alternatives are removed or reordered.
		const duplicateIndex = suggestions
			.slice(0, index)
			.filter(
				(candidate) =>
					candidate.kind === suggestion.kind &&
					candidate.replacement_text === suggestion.replacement_text,
			).length;
		const selected = index === props.selectedIndex;
		return button(
			'inkling-suggestion',
			() => apply(suggestion),
			{
				key: JSON.stringify([suggestion.kind, suggestion.replacement_text, duplicateIndex]),
				id: `inkling-suggestion-${index}`,
				tabIndex: selected ? 0 : -1,
				title: suggestionTitle(suggestion, lint.problem_text, text),
				attributes: { role: 'menuitem' },
				onfocus: () => props.onSelect(index),
			},
			suggestionLabel(suggestion, text),
		);
	});

	const bar = [
		...(lint.lint_kind === 'Spelling' && actions.addToUserDictionary
			? [
					iconButton(text.addToDictionary, ICON_BOOK_PLUS, () =>
						runAndClose(() => actions.addToUserDictionary!([lint.problem_text])),
					),
				]
			: []),
		...(actions.setRuleEnabled && box.rule
			? [
					iconButton(text.disableRule(box.rule), ICON_BAN, () =>
						runAndClose(() => actions.setRuleEnabled!(box.rule, false)),
					),
				]
			: []),
		...(actions.openOptions
			? [iconButton(text.settings, ICON_SETTINGS, () => void actions.openOptions!())]
			: []),
	];

	return h(
		'div',
		{
			key: 'inkling-popup',
			className: 'inkling-popup',
			onkeydown: onKeyDown,
			attributes: { role: 'dialog', 'aria-labelledby': 'inkling-kind' },
			'inkling-popup-hook': popupHook(props, refocusClose),
		},
		[
			h('style', {}, STYLE),
			head,
			h('div', { className: 'inkling-message', innerHTML: lint.message_html }, []),
			...(suggestions.length
				? [
						h(
							'div',
							{
								className: 'inkling-suggestions',
								attributes: { role: 'menu', 'aria-label': text.suggestions },
							},
							suggestionButtons,
						),
					]
				: []),
			...(bar.length ? [h('div', { className: 'inkling-bar' }, bar)] : []),
		],
	);
}
