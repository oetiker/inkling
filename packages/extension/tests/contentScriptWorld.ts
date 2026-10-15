import type { BrowserContext, CDPSession } from '@playwright/test';
import { MOCK_SERVER_URL, storageSet } from './extensionPages';
import { expect } from './fixtures';

/** Evaluate `expression` in the content script's world and return the result by value. */
export async function evaluate(
	cdp: CDPSession,
	contextId: number,
	expression: string,
): Promise<unknown> {
	const { result } = await cdp.send('Runtime.evaluate', {
		expression,
		contextId,
		returnByValue: true,
	});
	return result.value;
}

/** The event types the content script listens to on the object `expression` evaluates to. */
export async function listenerTypes(
	cdp: CDPSession,
	contextId: number,
	expression: string,
): Promise<string[]> {
	const { result } = await cdp.send('Runtime.evaluate', { expression, contextId });
	const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
		objectId: result.objectId!,
	});
	return listeners.map((listener) => listener.type).sort();
}

/**
 * Open a page, type a mistake into `editor` and attach to the content script's world.
 * Playwright neither reports errors of that world nor reaches into it; the DevTools
 * protocol does both.
 */
export async function pageWithMistake(
	context: BrowserContext,
	file: string,
	editor: string,
	settings: Record<string, unknown> = {},
) {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
		...settings,
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	const errors: string[] = [];
	cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) =>
		errors.push(exceptionDetails.exception?.description ?? exceptionDetails.text),
	);
	let contentScript: number | undefined;
	cdp.on('Runtime.executionContextCreated', ({ context }) => {
		if (context.name === 'Inkling') contentScript = context.id;
	});
	await cdp.send('Runtime.enable');

	await page.goto(`http://localhost:18081/${file}`);
	await page.locator(editor).fill('Das ist ein Tset.');
	await expect.poll(() => contentScript).toBeDefined();
	return { page, cdp, errors, contentScript: contentScript! };
}
