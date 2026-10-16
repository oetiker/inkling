import h from 'virtual-dom/h';
import { closestBox, type IgnorableLintBox, isPointInBox } from './Box';
import { nonEditableAncestor } from './domUtils';
import { getCaretPosition } from './editorUtils';
import RenderBox from './RenderBox';
import SuggestionBox, { focusSuggestion, type SuggestionBoxActions } from './SuggestionBox';

type ActivationKey = 'off' | 'shift' | 'control';

type ActivationHandler = () => void;

function monitorActivationKey(
	onActivation: ActivationHandler,
	key: string,
	interval = 300,
): () => void {
	let lastTime = 0;
	const handler = (e: KeyboardEvent) => {
		if (e.key.toLowerCase() !== key.toLowerCase()) return;
		const now = performance.now();
		const diff = now - lastTime;
		if (diff <= interval && diff > 10) onActivation();
		lastTime = now;
	};
	window.addEventListener('keydown', handler);
	return () => window.removeEventListener('keydown', handler);
}

export default class PopupHandler {
	private currentLintBoxes: IgnorableLintBox[];
	private popupLint: number | undefined;
	private selectedSuggestion = 0;
	/** Whether the open card should hold the keyboard focus, rather than the editor. */
	private popupFocus = false;
	private renderBox: RenderBox;
	private pointerDownCallback: (e: PointerEvent) => void;
	private activationKeyListener: (() => void) | undefined;
	private disposed = false;
	private readonly actions: SuggestionBoxActions & {
		getActivationKey?: () => Promise<ActivationKey>;
	};

	constructor(actions: SuggestionBoxActions & { getActivationKey?: () => Promise<ActivationKey> }) {
		this.actions = actions;
		this.currentLintBoxes = [];
		this.renderBox = new RenderBox(() => nonEditableAncestor(document.body));
		this.renderBox.getShadowHost().popover = 'manual';
		this.renderBox.getShadowHost().style.pointerEvents = 'none';
		this.renderBox.getShadowHost().style.border = 'none';
		// The browser gives a popover a padded Canvas background, centred in the viewport.
		// The card is positioned on its own, so the host must paint nothing at all.
		this.renderBox.getShadowHost().style.background = 'transparent';
		this.renderBox.getShadowHost().style.padding = '0';
		this.pointerDownCallback = (e) => {
			this.onPointerDown(e);
		};

		this.updateActivationKeyListener();
	}

	private updateActivationKeyListener() {
		if (this.activationKeyListener) {
			this.activationKeyListener();
			this.activationKeyListener = undefined;
		}

		const getKey = this.actions.getActivationKey;
		if (getKey) {
			getKey().then((key) => {
				if (key !== 'off' && !this.disposed) {
					this.activationKeyListener = monitorActivationKey(() => this.openClosestToCaret(), key);
				}
			});
		}
	}

	/** Open the card nearest the editor caret and move the keyboard into it. */
	private openClosestToCaret() {
		const host = this.renderBox.getShadowHost();
		const popupFocused = document.activeElement === host;
		const caretPosition = popupFocused ? null : getCaretPosition();
		const closestIdx = caretPosition
			? closestBox(caretPosition, this.currentLintBoxes)
			: popupFocused
				? this.popupLint
				: undefined;
		if (closestIdx == null || closestIdx < 0) return;

		this.popupLint = closestIdx;
		this.selectedSuggestion = 0;
		this.popupFocus = true;
		this.render();
		if (popupFocused) this.focusSelectedSuggestion();
	}

	/** Focus the active replacement without replacing the renderer's saved editor selection. */
	private focusSelectedSuggestion() {
		const root = this.renderBox.getShadowHost().shadowRoot;
		if (root) focusSuggestion(root, this.selectedSuggestion);
	}

	private onPointerDown(e: PointerEvent) {
		for (let i = 0; i < this.currentLintBoxes.length; i++) {
			const box = this.currentLintBoxes[i];

			if (e.composedPath().includes(box.source) && isPointInBox([e.x, e.y], box)) {
				// The click also places the caret, so the card must not take the focus.
				if (this.popupLint != null) this.close();
				this.popupLint = i;
				this.selectedSuggestion = 0;
				this.popupFocus = false;
				this.render();
				return;
			}
		}

		this.close();
	}

	private close = () => {
		this.popupLint = undefined;
		this.selectedSuggestion = 0;
		this.popupFocus = false;
		this.render();
	};

	/** Typing in the editor closes the card; it does not block the key. */
	private onEditorKeyDown = (event: KeyboardEvent) => {
		if (['Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(event.key)) return;
		if (event.composedPath().includes(this.renderBox.getShadowHost())) return;
		this.close();
	};

	private onOutsidePointerDown = (event: PointerEvent) => {
		const path = event.composedPath();
		if (path.includes(this.renderBox.getShadowHost())) return;
		// Editor pointer-downs are handled by the existing source listeners.
		if (this.currentLintBoxes.some((box) => path.includes(box.source))) return;
		this.close();
	};

	private render() {
		let tree = h('div', {}, []);
		const host = this.renderBox.getShadowHost();

		if (this.popupLint != null && this.popupLint < this.currentLintBoxes.length) {
			const box = this.currentLintBoxes[this.popupLint];

			tree = SuggestionBox({
				box,
				selectedIndex: this.selectedSuggestion,
				onSelect: (index) => {
					if (index === this.selectedSuggestion) return;
					this.selectedSuggestion = index;
					this.render();
				},
				focus: this.popupFocus,
				actions: this.actions,
				close: this.close,
			});
		}

		this.renderBox.render(tree);

		if (this.popupLint != null && this.popupLint < this.currentLintBoxes.length) {
			document.addEventListener('pointerdown', this.onOutsidePointerDown, true);
			document.addEventListener('keydown', this.onEditorKeyDown, true);
			host.style.setProperty('visibility', 'visible', 'important');
			if (host.isConnected && !host.matches(':popover-open')) {
				host.showPopover();
			}
		} else {
			document.removeEventListener('pointerdown', this.onOutsidePointerDown, true);
			document.removeEventListener('keydown', this.onEditorKeyDown, true);
			host.style.setProperty('visibility', 'hidden', 'important');
			if (host.isConnected && host.matches(':popover-open')) {
				host.hidePopover();
			}
		}
	}

	/** Close the card and remove every listener and element this handler added. */
	public dispose() {
		this.disposed = true;
		this.close();
		for (const box of this.currentLintBoxes) {
			box.source.removeEventListener('pointerdown', this.pointerDownCallback as EventListener);
		}
		this.currentLintBoxes = [];
		this.activationKeyListener?.();
		this.activationKeyListener = undefined;
		this.renderBox.remove();
	}

	/** Preserve logical selection through geometry updates, but never retarget stale row indices. */
	public updateLintBoxes(boxes: IgnorableLintBox[]) {
		const host = this.renderBox.getShadowHost();
		const popupFocused = document.activeElement === host;
		this.currentLintBoxes.forEach((b) => {
			b.source.removeEventListener('pointerdown', this.pointerDownCallback as EventListener);
		});

		const previous = this.popupLint == null ? undefined : this.currentLintBoxes[this.popupLint];
		const previousSelection = previous?.lint.suggestions[this.selectedSuggestion];
		if (previous) {
			// Context hashes are location-agnostic; source and span identify the occurrence.
			// Keep the clicked fragment of a wrapped lint, rather than jumping to its first line.
			const fragment = this.currentLintBoxes
				.slice(0, this.popupLint)
				.filter(
					(box) =>
						box.lint.context_hash === previous.lint.context_hash &&
						box.source === previous.source &&
						box.lint.span.start === previous.lint.span.start &&
						box.lint.span.end === previous.lint.span.end,
				).length;
			const matches = boxes.flatMap((box, index) =>
				box.lint.context_hash === previous.lint.context_hash &&
				box.source === previous.source &&
				box.lint.span.start === previous.lint.span.start &&
				box.lint.span.end === previous.lint.span.end &&
				box.lint.source === previous.lint.source
					? [index]
					: [],
			);
			this.popupLint = matches[Math.min(fragment, matches.length - 1)];
		}
		const next = this.popupLint == null ? undefined : boxes[this.popupLint];
		this.selectedSuggestion =
			next && previousSelection
				? Math.max(
						0,
						next.lint.suggestions.findIndex(
							(suggestion) =>
								suggestion.kind === previousSelection.kind &&
								suggestion.replacement_text === previousSelection.replacement_text,
						),
					)
				: 0;
		this.currentLintBoxes = boxes;
		this.currentLintBoxes.forEach((b) => {
			b.source.addEventListener('pointerdown', this.pointerDownCallback as EventListener);
		});

		this.render();
		if (popupFocused && this.popupLint != null && !host.shadowRoot?.activeElement) {
			this.focusSelectedSuggestion();
		}
	}
}
