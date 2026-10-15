import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pageStartTime } from '../src/contentScript/pageStart.ts';

describe('pageStartTime', () => {
	it('counts from the navigation start for a normal load', () => {
		assert.equal(pageStartTime(10_000, 400, 0), 9_600);
	});
	it('counts from the activation for a prerendered page', () => {
		assert.equal(pageStartTime(10_000, 5_000, 4_500), 9_500);
	});
});
