import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	languageCodes,
	type ServerLanguage,
	variantChoices,
	variantsFromList,
	variantsFromLocales,
} from '../src/languages.ts';

/** A part of what lt.oetiker.ch lists under /v2/languages. */
const LANGUAGES: ServerLanguage[] = [
	{ name: 'German', code: 'de', longCode: 'de' },
	{ name: 'German (Germany)', code: 'de', longCode: 'de-DE' },
	{ name: 'German (Austria)', code: 'de', longCode: 'de-AT' },
	{ name: 'German (Swiss)', code: 'de', longCode: 'de-CH' },
	{ name: 'English', code: 'en', longCode: 'en' },
	{ name: 'English (US)', code: 'en', longCode: 'en-US' },
	{ name: 'English (GB)', code: 'en', longCode: 'en-GB' },
	{ name: 'Italian', code: 'it', longCode: 'it' },
	{ name: 'Italian', code: 'it', longCode: 'it-IT' },
	{ name: 'Danish', code: 'da', longCode: 'da-DK' },
	{ name: 'German', code: 'de', longCode: 'de-DE' },
];

describe('variantChoices', () => {
	it('lists languages with at least two variants, without the bare code or duplicates', () => {
		assert.deepEqual(variantChoices(LANGUAGES), {
			de: ['de-DE', 'de-AT', 'de-CH'],
			en: ['en-US', 'en-GB'],
		});
	});
});

describe('languageCodes', () => {
	it('lists each code once', () => {
		assert.deepEqual(languageCodes(LANGUAGES), ['de', 'en', 'it', 'da']);
	});
});

describe('variantsFromLocales', () => {
	it('takes the first known variant per language and ignores unknown ones', () => {
		assert.deepEqual(variantsFromLocales(['de-li', 'de-ch', 'en', 'de-AT', 'en-GB'], LANGUAGES), {
			de: 'de-CH',
			en: 'en-GB',
		});
	});

	it('skips languages without a choice', () => {
		assert.deepEqual(variantsFromLocales(['it-IT', 'da-DK'], LANGUAGES), {});
	});
});

describe('variantsFromList', () => {
	it('reads a comma-separated list', () => {
		assert.deepEqual(variantsFromList(' de-CH, en-GB ,,'), { de: 'de-CH', en: 'en-GB' });
		assert.deepEqual(variantsFromList(''), {});
	});
});
