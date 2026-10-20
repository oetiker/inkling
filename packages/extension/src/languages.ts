/** A language as the server's `/v2/languages` lists it. */
export type ServerLanguage = {
	/** English name, such as `German (Swiss)`. */
	name: string;
	/** Language code without variant, such as `de`. */
	code: string;
	/** Full code, such as `de-CH`, or the bare code for the language as such. */
	longCode: string;
};

/** How the server should treat languages. */
export type LanguageSettings = {
	/** The variant to use per language code, such as `{ de: 'de-CH' }`. A missing code has no preference. */
	variants: Record<string, string>;
	/** Language codes, such as `de`, that language detection prefers for short texts. */
	preferredLanguages: string[];
	/** Language code of the writer's native language, or empty for none. */
	motherTongue: string;
	/** Also report style issues and less certain mistakes. */
	picky: boolean;
};

export const DEFAULT_LANGUAGE_SETTINGS: LanguageSettings = {
	variants: {},
	preferredLanguages: [],
	motherTongue: '',
	picky: false,
};

/**
 * The variants to choose from, per language code. Only languages with at least two
 * variants are listed; with a single one there is nothing to choose.
 */
export function variantChoices(languages: ServerLanguage[]): Record<string, string[]> {
	const byCode: Record<string, string[]> = {};
	for (const { code, longCode } of languages) {
		if (longCode === code) {
			continue;
		}
		const list = byCode[code] ?? [];
		if (!list.includes(longCode)) {
			list.push(longCode);
		}
		byCode[code] = list;
	}
	return Object.fromEntries(Object.entries(byCode).filter(([, list]) => list.length >= 2));
}

/** The distinct language codes the server knows, in the order it lists them. */
export function languageCodes(languages: ServerLanguage[]): string[] {
	return [...new Set(languages.map((language) => language.code))];
}

/**
 * The variant per language that the browser's `locales`, such as `['de-CH', 'en']`, ask for.
 * Only variants listed in `languages` count, since the server rejects a check that names
 * one it does not know. The first locale of a language wins.
 */
export function variantsFromLocales(
	locales: readonly string[],
	languages: ServerLanguage[],
): Record<string, string> {
	const choices = variantChoices(languages);
	const variants: Record<string, string> = {};
	for (const locale of locales) {
		for (const [code, list] of Object.entries(choices)) {
			const variant = list.find((v) => v.toLowerCase() === locale.toLowerCase());
			if (variant != null && variants[code] == null) {
				variants[code] = variant;
			}
		}
	}
	return variants;
}

/** The variant per language from a comma-separated list, such as `de-CH,en-GB`. */
export function variantsFromList(list: string): Record<string, string> {
	const variants: Record<string, string> = {};
	for (const entry of list.split(',')) {
		const variant = entry.trim();
		if (variant.length > 0) {
			variants[variant.split('-')[0].toLowerCase()] = variant;
		}
	}
	return variants;
}
