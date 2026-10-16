/**
 * The extension's texts in the browser's interface language, from
 * public/_locales/<language>/messages.json; English is the default locale.
 */

import english from '../public/_locales/en/messages.json' with { type: 'json' };

export type MessageKey = keyof typeof english;

/** An entry of messages.json. */
type MessageEntry = { message: string; placeholders?: Record<string, { content: string }> };

/** The text for `key`, with `$1`, `$2`, … replaced by `substitutions`. */
export function t(key: MessageKey, ...substitutions: string[]): string {
	// Chromium now and then answers "" for every key for the whole life of an extension
	// page. The English text from the bundle keeps the page readable then.
	const message = chrome.i18n.getMessage(key, substitutions);
	if (message !== '') {
		return message;
	}
	const entry: MessageEntry | undefined = (english as Record<string, MessageEntry>)[key];
	return entry == null ? key : fillMessage(entry, substitutions);
}

/**
 * The text of a messages.json entry, filled in the way chrome.i18n.getMessage does:
 * `$NAME$` becomes the content of placeholder `name` (in any case), then `$1` … `$9`
 * become the substitutions and `$$` becomes `$`.
 */
export function fillMessage(entry: MessageEntry, substitutions: string[]): string {
	const placeholders = entry.placeholders ?? {};
	const withPlaceholders = entry.message.replace(
		/\$([A-Za-z0-9_@]+)\$/g,
		(match, name: string) => placeholders[name.toLowerCase()]?.content ?? match,
	);
	// One pass, so a substitution that holds `$1` or `$$` stays as it is.
	return withPlaceholders.replace(/\$(\$|[1-9])/g, (_, what: string) =>
		what === '$' ? '$' : (substitutions[Number(what) - 1] ?? ''),
	);
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
