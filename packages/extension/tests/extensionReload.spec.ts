import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { getBackground, MOCK_SERVER_URL, storageSet } from './extensionPages';
import { expect, test } from './fixtures';

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'Playwright cannot open Firefox extension pages',
);

/** Evaluate `expression` in the content script's world and return the result by value. */
async function evaluate(cdp: CDPSession, contextId: number, expression: string): Promise<unknown> {
	const { result } = await cdp.send('Runtime.evaluate', {
		expression,
		contextId,
		returnByValue: true,
	});
	return result.value;
}

/** The event types the content script listens to on the object `expression` evaluates to. */
async function listenerTypes(
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
async function pageWithMistake(context: BrowserContext, file: string, editor: string) {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
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

async function reloadExtension(context: BrowserContext, page: Page) {
	const background = await getBackground(context);
	const ext = await context.newPage();
	await ext.goto(`chrome-extension://${new URL(background.url()).host}/options.html`);
	// The reload closes the extension page, so let the evaluation return first.
	await ext.evaluate(() => {
		setTimeout(() => chrome.runtime.reload(), 100);
	});
	await page.bringToFront();
}

/** Type text the old script has not checked yet, then expect it to have left no trace. */
async function expectNoTrace(
	page: Page,
	editor: string,
	cdp: CDPSession,
	contentScript: number,
	errors: string[],
) {
	await page.locator(editor).pressSequentially(' Noch ein Tset.');
	await page.waitForTimeout(2000);
	expect(errors).toEqual([]);
	await expect(page.locator('inkling-render-box')).toHaveCount(0);
	const editorNode = `document.querySelector(${JSON.stringify(editor)})`;
	for (const target of [editorNode, 'document.documentElement', 'document', 'window']) {
		expect(await listenerTypes(cdp, contentScript, target), target).toEqual([]);
	}
}

test('An open tab drops its marks and stays quiet after the extension is reloaded', async ({
	context,
}) => {
	const { page, cdp, errors, contentScript } = await pageWithMistake(
		context,
		'simple_textarea.html',
		'textarea',
	);
	await expect(page.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });
	expect(await listenerTypes(cdp, contentScript, 'document.querySelector("textarea")')).toContain(
		'input',
	);

	await reloadExtension(context, page);
	await expect(page.locator('inkling-render-box')).toHaveCount(0, { timeout: 10000 });
	await expect(page.locator('#inkling-highlight')).toHaveCount(0);
	await expectNoTrace(page, 'textarea', cdp, contentScript, errors);
});

test.describe('with CSS highlights', () => {
	// Chromium reports a webdriver otherwise, and Inkling then draws overlay boxes.
	// A textarea gets overlay boxes in any case: it has no text nodes to highlight.
	test.use({ extraBrowserArgs: ['--disable-blink-features=AutomationControlled'] });

	test('An open tab drops its CSS highlights after the extension is reloaded', async ({
		context,
	}) => {
		const editor = '[contenteditable]';
		const { page, cdp, errors, contentScript } = await pageWithMistake(
			context,
			'simple_contenteditable.html',
			editor,
		);
		const highlights = `[...CSS.highlights.keys()].filter((name) => name.startsWith('inkling-'))`;
		await expect
			.poll(() => evaluate(cdp, contentScript, highlights), { timeout: 30000 })
			.not.toEqual([]);
		await expect(page.locator('style[id^="inkling-highlight-style-"]')).not.toHaveCount(0);

		await reloadExtension(context, page);
		await expect
			.poll(() => evaluate(cdp, contentScript, highlights), { timeout: 10000 })
			.toEqual([]);
		await expect(page.locator('style[id^="inkling-highlight-style-"]')).toHaveCount(0);
		await expectNoTrace(page, editor, cdp, contentScript, errors);
	});
});
