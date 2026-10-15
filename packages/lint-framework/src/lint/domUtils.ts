import { isBoxInScreen } from './Box';
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
 * Given an element and a Span of text inside it, compute the Range that represents the region of the DOM represented.
 * Accounts for `<br>` elements which `innerText` converts to newlines.
 * @param target
 * @param span
 */
export function getRangeForTextSpan(target: Element, span: Span): Range | null {
	return createTextSpanRangeFinder(target)(span);
}

/**
 * Return a function that does `getRangeForTextSpan` for many spans in `target`. It
 * walks the DOM once and then finds each span by binary search, instead of walking
 * the whole DOM per span. Valid only until the DOM of `target` changes.
 */
export function createTextSpanRangeFinder(target: Element): (span: Span) => Range | null {
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
