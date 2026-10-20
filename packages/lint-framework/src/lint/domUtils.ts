import { isBoxInScreen } from './Box';
import { getCMRoot } from './editorUtils';
import type { Span } from './types';

/**
 * Turn a `NodeList` into a normal JavaScript array.
 * @param collection
 */
export function extractFromHTMLCollection(collection: HTMLCollection): Element[] {
	const elements: Element[] = [];
	for (let i = 0; i < collection.length; i++) {
		const el = collection.item(i);
		if (el) elements.push(el);
	}
	return elements;
}

/**
 * Turn a `NodeList` into a normal JavaScript array.
 * @param list
 */
export function extractFromNodeList<T extends Node>(list: NodeListOf<T>): T[] {
	const elements: T[] = [];

	for (let i = 0; i < list.length; i++) {
		const item = list[i];
		elements.push(item);
	}

	return elements;
}

export function getNodesFromQuerySelector(element: Element, query: string) {
	return extractFromNodeList(element.querySelectorAll(query));
}

/** Get a node's closest ancestor that has `display: block`. */
export function getClosestBlockAncestor(leaf: Node, root: Element): Element | null {
	let current: Node | null = leaf;

	while (current) {
		if (current instanceof Element) {
			if (getComputedStyle(current).display === 'block') {
				return current;
			}

			if (current === root) {
				break;
			}
		}

		current = current.parentNode;
	}

	return null;
}

/**
 * Walk up from `el` to the first element that is not editable, so render boxes are never inserted
 * into the edited content itself (e.g. a designMode or contenteditable `<body>`), where they would
 * be serialized with it and trigger mutation observers watching it.
 */
export function nonEditableAncestor(el: HTMLElement): HTMLElement {
	let node: HTMLElement | null = el;

	while (node?.isContentEditable) {
		node = node.parentElement;
	}

	return node ?? el.ownerDocument.documentElement;
}

/**
 * Flatten a provided node, and its children into a single array.
 * @param node
 */
export function leafNodes(node: Node): Node[] {
	const out: Node[] = [];

	const children = extractFromNodeList(node.childNodes);

	if (children.length === 0) {
		return [node];
	}

	for (const child of children) {
		const sub = leafNodes(child);
		sub.forEach((v) => {
			out.push(v);
		});
	}

	return out;
}

/**
 * Given an element and a Span of its text, compute the Range of the DOM that holds that text.
 * The span counts in the text the element was checked with: its `innerText`, or the
 * newline-free text of a CodeMirror editor.
 * @param target
 * @param span
 */
export function getRangeForTextSpan(target: Element, span: Span): Range | null {
	return createTextSpanRangeFinder(target)(span);
}

/**
 * Return a function that does `getRangeForTextSpan` for many spans in `target`. It
 * walks the DOM once, instead of once per span. Valid only until the DOM of `target`
 * changes.
 */
export function createTextSpanRangeFinder(target: Element): (span: Span) => Range | null {
	if (target instanceof HTMLElement && getCMRoot(target) == null) {
		return createInnerTextRangeFinder(target);
	}
	return createLeafCountRangeFinder(target);
}

/**
 * Find spans of `target.innerText`. That text has line breaks the DOM does not: one at
 * the end of each block such as a div, two around a paragraph. It also lacks the spaces
 * the browser collapses. Counting DOM characters instead put marks in a web mail reply
 * editor, which has a div per line, 31 characters after their words by the quoted mail,
 * and applying a suggestion replaced the text there.
 *
 * So walk the DOM text and `innerText` side by side: a character of either that the
 * other lacks is skipped, and each `innerText` character that the DOM has gets its
 * place in the DOM.
 */
function createInnerTextRangeFinder(target: HTMLElement): (span: Span) => Range | null {
	const text = target.innerText;
	const nodes: (Node | null)[] = new Array(text.length).fill(null);
	const offsets: number[] = new Array(text.length).fill(0);
	const isSpace = (c: string) => /\s/u.test(c);
	let at = 0;

	for (const leaf of leafNodes(target)) {
		if (leaf.nodeName === 'BR') {
			if (text[at] === '\n') {
				at++;
			}
			continue;
		}
		if (leaf.nodeType !== Node.TEXT_NODE) {
			continue;
		}

		const data = (leaf as Text).data;
		for (let index = 0; index < data.length && at < text.length; index++) {
			const c = data[index];
			const matches = (t: string) =>
				t === c || t.toLowerCase() === c.toLowerCase() || (isSpace(t) && isSpace(c));
			// Line breaks and spaces of innerText that this text does not have.
			while (at < text.length && !matches(text[at]) && isSpace(text[at])) {
				at++;
			}
			if (at < text.length && matches(text[at])) {
				nodes[at] = leaf;
				offsets[at] = index;
				at++;
			}
			// Otherwise innerText dropped the character, for example a collapsed space.
		}
	}

	return (span) => {
		let start = Math.max(0, span.start);
		while (start < span.end && start < text.length && nodes[start] == null) {
			start++;
		}
		let end = Math.min(span.end, text.length) - 1;
		while (end >= start && nodes[end] == null) {
			end--;
		}
		if (start >= text.length || end < start) {
			return null;
		}

		const range = document.createRange();
		range.setStart(nodes[start]!, offsets[start]);
		range.setEnd(nodes[end]!, offsets[end] + 1);
		return range;
	};
}

/** Find spans by counting the characters of the DOM, a `<br>` as one. */
function createLeafCountRangeFinder(target: Element): (span: Span) => Range | null {
	const leaves = leafNodes(target);
	const starts: number[] = [];
	const ends: number[] = [];
	let traversed = 0;

	for (const leaf of leaves) {
		starts.push(traversed);
		traversed += leaf.nodeName === 'BR' ? 1 : (leaf.textContent ?? '').length;
		ends.push(traversed);
	}

	/** The first leaf from `from` on that is not a `<br>` and ends after (or at) `offset`. */
	const findLeaf = (from: number, offset: number, inclusive: boolean): number => {
		let lo = from;
		let hi = leaves.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (inclusive ? ends[mid] >= offset : ends[mid] > offset) {
				hi = mid;
			} else {
				lo = mid + 1;
			}
		}
		while (lo < leaves.length && leaves[lo].nodeName === 'BR') {
			lo++;
		}
		return lo;
	};

	return (span) => {
		const start = findLeaf(0, span.start, false);
		if (start >= leaves.length) {
			return null;
		}
		const end = findLeaf(start, span.end, true);
		if (end >= leaves.length) {
			return null;
		}

		const range = document.createRange();
		range.setStart(leaves[start], span.start - starts[start]);
		range.setEnd(leaves[end], span.end - starts[end]);
		return range;
	};
}

const sharedRange: Range | null = typeof document !== 'undefined' ? document.createRange() : null;

/** Check if a node represents a heading (native heading tags or role="heading"). */
export function isHeading(node: Node): boolean {
	if (!(node instanceof Element)) return false;

	const tag = node.tagName.toLowerCase();
	if (/^h[1-6]$/.test(tag)) return true;

	const role = node.getAttribute('role');
	return role?.toLowerCase() === 'heading';
}

/** Check if an element is visible to the user.
 *
 * It is coarse and meant for performance improvements, not precision.*/
export function isVisible(node: Node): boolean {
	try {
		if (!node || !(node as any).ownerDocument) return false;

		if (node instanceof Element) {
			if (!node.isConnected) return false;

			// Google Docs integration uses an off-screen bridge element that is intentionally
			// hidden from users. Treat it as visible when its editor container is on-screen.
			if (node.getAttribute('data-inkling-google-docs-target') === 'true') {
				const editor = node.closest('.kix-appview-editor') as HTMLElement | null;
				if (!editor) return false;
				return isBoxInScreen(editor.getBoundingClientRect());
			}

			const rect = node.getBoundingClientRect();
			if (!isBoxInScreen(rect)) return false;
			const cv = (node as any).checkVisibility;
			if (typeof cv === 'function') return cv.call(node);
			const cs = getComputedStyle(node);
			if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
			return true;
		}

		if (!sharedRange) return false;
		const parent = (node as any).parentElement as Element | null;
		if (parent && !parent.isConnected) return false;
		sharedRange.selectNode(node);
		const rect = sharedRange.getBoundingClientRect();
		return isBoxInScreen(rect);
	} catch {
		return false;
	}
}
