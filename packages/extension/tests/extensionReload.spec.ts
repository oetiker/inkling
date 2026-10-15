import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { evaluate, listenerTypes, pageWithMistake } from './contentScriptWorld';
import { getBackground } from './extensionPages';
import { expect, test } from './fixtures';

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'Playwright cannot open Firefox extension pages',
);

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
