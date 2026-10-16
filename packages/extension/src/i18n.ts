/**
 * The extension's texts in the browser's interface language, from
 * public/_locales/<language>/messages.json; English is the default locale.
 */

export type MessageKey = keyof typeof import('../public/_locales/en/messages.json');

/** The text for `key`, with `$1`, `$2`, … replaced by `substitutions`. */
export function t(key: MessageKey, ...substitutions: string[]): string {
	// getMessage only falls back to the default locale; an empty answer means a missing key.
	return chrome.i18n.getMessage(key, substitutions) || key;
}

/**
 * A text with one substitution split around it, for placing an element such as
 * a link where the translation puts it.
 */
export function tAround(key: MessageKey): [before: string, after: string] {
	const marker = '\u0001';
	const [before, after = ''] = t(key, marker).split(marker);
	return [before, after];
}

/** Tell the page its language, so screen readers and hyphenation use it. */
export function setDocumentLanguage(): void {
	document.documentElement.lang = chrome.i18n.getUILanguage();
}
