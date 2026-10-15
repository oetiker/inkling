import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLintRemapper } from '../../lint-framework/src/lint/spanMapping.ts';
import type { UnpackedLint } from '../../lint-framework/src/lint/unpackLint.ts';

function lintAt(source: string, word: string, from = 0): UnpackedLint {
	const start = source.indexOf(word, from);
	return {
		span: { start, end: start + word.length },
		lint_kind: 'Spelling',
		lint_kind_pretty: 'Spelling',
		suggestions: [],
		message_html: '',
		problem_text: word,
		context_hash: '',
		source,
	};
}

describe('createLintRemapper', () => {
	const old = 'Ein Tset hier, ein Tset dort.';
	const first = lintAt(old, 'Tset');
	const second = lintAt(old, 'Tset', first.span.end);

	it('keeps a lint when the text is unchanged', () => {
		assert.equal(createLintRemapper(old)(first), first);
	});

	it('shifts lints after an edit and keeps lints before it, for every lint of a check', () => {
		const current = 'Ein Tset hier, noch ein Tset dort.';
		const remap = createLintRemapper(current);
		assert.deepEqual(remap(first)?.span, first.span);
		const moved = remap(second);
		assert.equal(current.slice(moved!.span.start, moved!.span.end), 'Tset');
		assert.equal(moved!.span.start, second.span.start + 5);
		assert.equal(moved!.source, current);
	});

	it('hides a lint the edit touched', () => {
		const current = 'Ein Test hier, ein Tset dort.';
		const remap = createLintRemapper(current);
		assert.equal(remap(first), null);
		assert.deepEqual(remap(second)?.span, second.span);
	});

	it('handles lints from different sources with one remapper', () => {
		const current = 'Ein Tset hier, ein Tset dort!';
		const other = 'Ein Tset hier, ein Tset dort?';
		const remap = createLintRemapper(current);
		assert.deepEqual(remap(first)?.span, first.span);
		assert.deepEqual(remap(lintAt(other, 'Tset'))?.span, first.span);
		assert.deepEqual(remap(second)?.span, second.span);
	});
});
