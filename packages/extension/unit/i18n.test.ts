import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { fillMessage, t, tAround } from '../src/i18n.ts';

/** Stands in for chrome.i18n.getMessage; null acts out the empty catalog. */
let catalog: Record<string, string> | null = null;

beforeEach(() => {
	catalog = null;
	(globalThis as unknown as { chrome: unknown }).chrome = {
		i18n: {
			getMessage: (key: string, substitutions: string[]) =>
				catalog == null ? '' : (catalog[key] ?? '').replace('$1', substitutions[0] ?? ''),
		},
	};
});

describe('t', () => {
	it('uses the browser text when there is one', () => {
		catalog = { couldNotLoad: 'Die Einstellungen konnten nicht geladen werden: $1' };
		assert.equal(t('couldNotLoad', 'x'), 'Die Einstellungen konnten nicht geladen werden: x');
	});
	it('falls back to English when the browser answers with an empty text', () => {
		assert.equal(t('optionsTitle'), 'Inkling Settings');
	});
	it('fills the placeholders of the English text', () => {
		assert.equal(
			t('couldNotSaveSetting', 'Delay', 'disk full'),
			'Could not save "Delay": disk full',
		);
		assert.equal(t('couldNotLoad', 'oops'), 'Could not load the settings: oops');
	});
	it('splits the English text around its substitution', () => {
		assert.deepEqual(tAround('noServerText'), ['', ' to add one.']);
	});
});

describe('fillMessage', () => {
	const entry = {
		message: 'Replace $FROM$ with $to$ for $$5',
		placeholders: { from: { content: '"$1"' }, to: { content: '"$2"' } },
	};
	it('replaces named placeholders in any case and their $n', () => {
		assert.equal(fillMessage(entry, ['a', 'b']), 'Replace "a" with "b" for $5');
	});
	it('leaves $ signs inside substitutions alone', () => {
		assert.equal(fillMessage(entry, ['$2', '$$']), 'Replace "$2" with "$$" for $5');
	});
	it('drops a missing substitution', () => {
		assert.equal(fillMessage(entry, ['a']), 'Replace "a" with "" for $5');
	});
	it('also takes $n written in the message itself', () => {
		assert.equal(fillMessage({ message: 'Hello $1!' }, ['you']), 'Hello you!');
	});
});
