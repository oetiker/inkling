import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SuggestionKind } from 'lint-framework';
import {
	checkEndpoint,
	checkWithLanguageTool,
	fetchServerLanguages,
	matchesToLintGroups,
} from '../src/background/languageTool.ts';
import { DEFAULT_LANGUAGE_SETTINGS } from '../src/languages.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function match(overrides: Record<string, unknown> = {}) {
	return {
		message: 'Möglicher Tippfehler gefunden.',
		offset: 12,
		length: 4,
		replacements: [{ value: 'Test' }, { value: 'Döstet' }],
		context: { text: 'Das ist ein Tset mit einen Fehler.' },
		rule: {
			id: 'GERMAN_SPELLER_RULE',
			issueType: 'misspelling',
			category: { id: 'TYPOS', name: 'Mögliche Tippfehler' },
		},
		...overrides,
	};
}

describe('checkEndpoint', () => {
	it('accepts the server URL with or without /v2 and trailing slashes', () => {
		assert.equal(checkEndpoint('https://lt.example.com'), 'https://lt.example.com/v2/check');
		assert.equal(checkEndpoint('https://lt.example.com/'), 'https://lt.example.com/v2/check');
		assert.equal(checkEndpoint(' https://lt.example.com/v2/ '), 'https://lt.example.com/v2/check');
		assert.equal(checkEndpoint('http://localhost:8081/lt'), 'http://localhost:8081/lt/v2/check');
	});
});

describe('matchesToLintGroups', () => {
	it('converts a match into a lint grouped by rule ID', () => {
		const text = 'Das ist ein Tset mit einen Fehler.';
		const groups = matchesToLintGroups(text, [match()]);

		assert.deepEqual(Object.keys(groups), ['GERMAN_SPELLER_RULE']);
		const [lint] = groups.GERMAN_SPELLER_RULE;
		assert.deepEqual(lint.span, { start: 12, end: 16 });
		assert.equal(lint.problem_text, 'Tset');
		assert.equal(lint.lint_kind, 'Spelling');
		assert.equal(lint.lint_kind_pretty, 'Mögliche Tippfehler');
		assert.deepEqual(lint.suggestions, [
			{ kind: SuggestionKind.Replace, replacement_text: 'Test' },
			{ kind: SuggestionKind.Replace, replacement_text: 'Döstet' },
		]);
		assert.equal(lint.source, text);
	});

	it('uses UTF-16 offsets as they are, so text after an emoji lines up', () => {
		// The server counts the emoji as two code units, as JavaScript strings do.
		const text = 'Fehler. 😀 Und dass ist falsch.';
		const offset = text.indexOf('dass');
		const groups = matchesToLintGroups(text, [
			match({
				offset,
				length: 4,
				rule: { id: 'DASS_MIT_VERB', category: { id: 'CONFUSED_WORDS', name: 'Verwechslungen' } },
			}),
		]);

		assert.equal(groups.DASS_MIT_VERB[0].problem_text, 'dass');
		assert.equal(groups.DASS_MIT_VERB[0].lint_kind, 'Grammar');
	});

	it('sorts every match into one of three color groups', () => {
		// Issue types and categories as lt.oetiker.ch and the LanguageTool rule files report them.
		const cases: [string | undefined, string, string][] = [
			['misspelling', 'TYPOS', 'Spelling'],
			// A real word in the wrong place is grammar in every language, even where English calls it a misspelling.
			['misspelling', 'CONFUSED_WORDS', 'Grammar'],
			['misspelling', 'NONSTANDARD_PHRASES', 'Grammar'],
			['uncategorized', 'CONFUSED_WORDS', 'Grammar'],
			['duplication', 'MISC', 'Spelling'],
			['duplication', 'REDUNDANCY', 'Spelling'],
			['uncategorized', 'TYPOS', 'Spelling'],
			['misspelling', 'MULTITOKEN_SPELLING', 'Spelling'],
			['style', 'STYLE', 'Style'],
			['register', 'MISC', 'Style'],
			['locale-violation', 'MISC', 'Style'],
			['uncategorized', 'REDUNDANCY', 'Style'],
			['uncategorized', 'COLLOQUIALISMS', 'Style'],
			['uncategorized', 'GENDER_NEUTRALITY', 'Style'],
			[undefined, 'CREATIVE_WRITING', 'Style'],
			['uncategorized', 'WIKIPEDIA', 'Style'],
			['uncategorized', 'HILFESTELLUNG_KOMMASETZUNG', 'Grammar'],
			['uncategorized', 'AGREEMENT', 'Grammar'],
			['uncategorized', 'COMPOUNDING', 'Grammar'],
			['typographical', 'PUNCTUATION', 'Grammar'],
			['whitespace', 'TYPOGRAPHY', 'Grammar'],
			[undefined, 'SOMETHING_NEW', 'Grammar'],
		];
		for (const [issueType, category, kind] of cases) {
			const groups = matchesToLintGroups('a b', [
				match({
					offset: 0,
					length: 1,
					rule: { id: 'R', issueType, category: { id: category, name: 'x' } },
				}),
			]);
			assert.equal(groups.R[0].lint_kind, kind, `${issueType} / ${category}`);
		}
	});

	it('escapes HTML in messages', () => {
		const groups = matchesToLintGroups('a b', [
			match({ message: 'Use <b> & "x"', offset: 0, length: 1 }),
		]);
		assert.equal(groups.GERMAN_SPELLER_RULE[0].message_html, 'Use &lt;b&gt; &amp; &quot;x&quot;');
	});

	it('turns an empty replacement into a removal and keeps at most five suggestions', () => {
		const replacements = ['', 'a', 'b', 'c', 'd', 'e', 'f'].map((value) => ({ value }));
		const groups = matchesToLintGroups('x  y', [match({ offset: 1, length: 1, replacements })]);
		const suggestions = groups.GERMAN_SPELLER_RULE[0].suggestions;

		assert.equal(suggestions.length, 5);
		assert.equal(suggestions[0].kind, SuggestionKind.Remove);
	});

	it('derives the context hash from the rule and the server context window only', () => {
		const first = matchesToLintGroups('Ein Tset.', [match()]).GERMAN_SPELLER_RULE[0];
		const second = matchesToLintGroups('Neu: Ein Tset.', [match()]).GERMAN_SPELLER_RULE[0];
		const otherRule = matchesToLintGroups('Ein Tset.', [
			match({ rule: { id: 'OTHER', category: { id: 'TYPOS', name: 'x' } } }),
		]).OTHER[0];

		assert.match(first.context_hash, /^\d+$/);
		assert.equal(first.context_hash, second.context_hash);
		assert.notEqual(first.context_hash, otherRule.context_hash);
	});
});

describe('checkWithLanguageTool', () => {
	it('sends text, language settings and disabled rules, and reports the detected language', async () => {
		let sentUrl = '';
		let sentBody = new URLSearchParams();
		globalThis.fetch = async (url, init) => {
			sentUrl = String(url);
			sentBody = init?.body as URLSearchParams;
			return Response.json({
				language: { code: 'auto', detectedLanguage: { code: 'de-CH' } },
				matches: [match()],
			});
		};

		const result = await checkWithLanguageTool('Das ist ein Tset mit einen Fehler.', {
			serverUrl: 'https://lt.example.com',
			languageSettings: {
				variants: { de: 'de-CH', en: 'en-GB' },
				preferredLanguages: ['de', 'en'],
				motherTongue: 'de',
				picky: true,
			},
			disabledRules: ['A', 'B'],
		});

		assert.equal(sentUrl, 'https://lt.example.com/v2/check');
		assert.equal(sentBody.get('language'), 'auto');
		assert.equal(sentBody.get('preferredVariants'), 'de-CH,en-GB');
		assert.equal(sentBody.get('preferredLanguages'), 'de,en');
		assert.equal(sentBody.get('motherTongue'), 'de');
		assert.equal(sentBody.get('level'), 'picky');
		assert.equal(sentBody.get('disabledRules'), 'A,B');
		assert.equal(result.language, 'de-CH');
		assert.equal(result.lints.GERMAN_SPELLER_RULE.length, 1);
	});

	it('sends Markdown as annotated data and marks the word in the original text', async () => {
		const text = '## Ein **Tset**\n\nSiehe [Link](https://x.ch/Tset).';
		let sentBody = new URLSearchParams();
		globalThis.fetch = async (_url, init) => {
			sentBody = init?.body as URLSearchParams;
			// LanguageTool counts offsets in the original string, markup included.
			return Response.json({
				language: { code: 'de-DE' },
				matches: [match({ offset: text.indexOf('Tset'), length: 4 })],
			});
		};

		const result = await checkWithLanguageTool(text, {
			serverUrl: 'https://lt.example.com',
			languageSettings: DEFAULT_LANGUAGE_SETTINGS,
			disabledRules: [],
			language: 'markdown',
		});

		assert.equal(sentBody.has('text'), false);
		const data = JSON.parse(sentBody.get('data') ?? '{}');
		assert.deepEqual(data.annotation.slice(0, 4), [
			{ markup: '## ' },
			{ text: 'Ein ' },
			{ markup: '**' },
			{ text: 'Tset' },
		]);
		assert.equal(
			data.annotation.map((p: { text?: string; markup?: string }) => p.text ?? p.markup).join(''),
			text,
		);
		const [lint] = result.lints.GERMAN_SPELLER_RULE;
		assert.equal(lint.problem_text, 'Tset');
		assert.deepEqual(lint.span, { start: 9, end: 13 });
	});

	it('sends text of other languages as plain text', async () => {
		let sentBody = new URLSearchParams();
		globalThis.fetch = async (_url, init) => {
			sentBody = init?.body as URLSearchParams;
			return Response.json({ language: { code: 'en-US' }, matches: [] });
		};

		for (const language of [undefined, 'plaintext', 'typst'] as const) {
			await checkWithLanguageTool('**Hello**', {
				serverUrl: 'https://lt.example.com',
				languageSettings: DEFAULT_LANGUAGE_SETTINGS,
				disabledRules: [],
				language,
			});
			assert.equal(sentBody.get('text'), '**Hello**');
			assert.equal(sentBody.has('data'), false);
		}
	});

	it('omits empty optional parameters', async () => {
		let sentBody = new URLSearchParams();
		globalThis.fetch = async (_url, init) => {
			sentBody = init?.body as URLSearchParams;
			return Response.json({ language: { code: 'en-US' }, matches: [] });
		};

		await checkWithLanguageTool('Hello', {
			serverUrl: 'https://lt.example.com',
			languageSettings: DEFAULT_LANGUAGE_SETTINGS,
			disabledRules: [],
		});

		for (const name of ['preferredVariants', 'preferredLanguages', 'motherTongue', 'level']) {
			assert.equal(sentBody.has(name), false, name);
		}
		assert.equal(sentBody.has('disabledRules'), false);
	});

	it('rejects when the server answers with an error status', async () => {
		globalThis.fetch = async () => new Response('Error: text too long', { status: 413 });

		await assert.rejects(
			checkWithLanguageTool('Hello', {
				serverUrl: 'https://lt.example.com',
				languageSettings: DEFAULT_LANGUAGE_SETTINGS,
				disabledRules: [],
			}),
			/413/,
		);
	});
});

describe('fetchServerLanguages', () => {
	it('reads the language list and drops malformed entries', async () => {
		let sentUrl = '';
		globalThis.fetch = async (url) => {
			sentUrl = String(url);
			return Response.json([
				{ name: 'German (Swiss)', code: 'de', longCode: 'de-CH' },
				{ name: 'broken' },
			]);
		};

		assert.deepEqual(await fetchServerLanguages('https://lt.example.com/v2/'), [
			{ name: 'German (Swiss)', code: 'de', longCode: 'de-CH' },
		]);
		assert.equal(sentUrl, 'https://lt.example.com/v2/languages');
	});

	it('rejects an answer that is not a list', async () => {
		globalThis.fetch = async () => new Response('mock LanguageTool');
		await assert.rejects(fetchServerLanguages('https://lt.example.com'));
	});
});
