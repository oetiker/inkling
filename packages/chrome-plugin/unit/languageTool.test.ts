import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SuggestionKind } from 'lint-framework';
import {
	checkEndpoint,
	checkWithLanguageTool,
	matchesToLintGroups,
} from '../src/background/languageTool.ts';

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
		assert.equal(groups.DASS_MIT_VERB[0].lint_kind, 'WordChoice');
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
	it('sends text, preferred variants and disabled rules, and reports the detected language', async () => {
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
			preferredVariants: 'de-CH,en-GB',
			disabledRules: ['A', 'B'],
		});

		assert.equal(sentUrl, 'https://lt.example.com/v2/check');
		assert.equal(sentBody.get('language'), 'auto');
		assert.equal(sentBody.get('preferredVariants'), 'de-CH,en-GB');
		assert.equal(sentBody.get('disabledRules'), 'A,B');
		assert.equal(result.language, 'de-CH');
		assert.equal(result.lints.GERMAN_SPELLER_RULE.length, 1);
	});

	it('omits empty optional parameters', async () => {
		let sentBody = new URLSearchParams();
		globalThis.fetch = async (_url, init) => {
			sentBody = init?.body as URLSearchParams;
			return Response.json({ language: { code: 'en-US' }, matches: [] });
		};

		await checkWithLanguageTool('Hello', {
			serverUrl: 'https://lt.example.com',
			preferredVariants: ' ',
			disabledRules: [],
		});

		assert.equal(sentBody.has('preferredVariants'), false);
		assert.equal(sentBody.has('disabledRules'), false);
	});

	it('rejects when the server answers with an error status', async () => {
		globalThis.fetch = async () => new Response('Error: text too long', { status: 413 });

		await assert.rejects(
			checkWithLanguageTool('Hello', {
				serverUrl: 'https://lt.example.com',
				preferredVariants: '',
				disabledRules: [],
			}),
			/413/,
		);
	});
});
