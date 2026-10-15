import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createErrorResponse, unwrapResponse } from '../src/protocol.ts';

describe('error responses', () => {
	it('carries the message of a failure', () => {
		assert.deepEqual(createErrorResponse(new Error('boom')), { kind: 'error', message: 'boom' });
		assert.deepEqual(createErrorResponse('plain'), { kind: 'error', message: 'plain' });
	});
	it('turns an error response into a rejection', () => {
		assert.throws(() => unwrapResponse(createErrorResponse(new Error('boom'))), /boom/);
	});
	it('passes a normal response through', () => {
		const response = { kind: 'getDelay', delay: 5 };
		assert.equal(unwrapResponse(response), response);
	});
});
