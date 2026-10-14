import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pauseEndedByStart } from '../src/background/tabPause.ts';

describe('pauseEndedByStart', () => {
	it('ends a pause set before the document started', () => {
		assert.equal(pauseEndedByStart(1000, 2000), true);
	});
	it('keeps a pause set after the document started', () => {
		assert.equal(pauseEndedByStart(3000, 2000), false);
	});
	it('ignores a missing pause', () => {
		assert.equal(pauseEndedByStart(undefined, 2000), false);
	});
});
