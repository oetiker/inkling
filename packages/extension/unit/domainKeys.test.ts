import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { domainLookupCandidates, domainWriteTarget } from '../src/background/domainKeys.ts';

describe('domainLookupCandidates', () => {
	it('tries the exact host first, then without www.', () => {
		assert.deepEqual(domainLookupCandidates('www.reddit.com'), ['www.reddit.com', 'reddit.com']);
	});
	it('has one candidate for a host without www.', () => {
		assert.deepEqual(domainLookupCandidates('reddit.com'), ['reddit.com']);
		assert.deepEqual(domainLookupCandidates('old.reddit.com'), ['old.reddit.com']);
	});
});

describe('domainWriteTarget', () => {
	it('writes the www. key when that is what the lookup finds', () => {
		assert.equal(
			domainWriteTarget('www.reddit.com', new Set(['www.reddit.com'])),
			'www.reddit.com',
		);
	});
	it('writes the bare key when only that is stored', () => {
		assert.equal(domainWriteTarget('www.localhost', new Set(['localhost'])), 'localhost');
	});
	it('prefers the exact host when both are stored', () => {
		assert.equal(
			domainWriteTarget('www.reddit.com', new Set(['www.reddit.com', 'reddit.com'])),
			'www.reddit.com',
		);
	});
	it('writes the exact host when nothing is stored', () => {
		assert.equal(domainWriteTarget('www.example.com', new Set()), 'www.example.com');
		assert.equal(domainWriteTarget('sub.example.com', new Set()), 'sub.example.com');
	});
});
