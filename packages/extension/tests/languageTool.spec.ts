import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';

const TEST_PAGE_URL = 'http://localhost:18081/simple_textarea.html';
/** Set LT_TEST_SERVER to run against a real LanguageTool server instead of the stand-in. */
const MOCK_SERVER_URL = process.env.LT_TEST_SERVER ?? 'http://127.0.0.1:18082';

async function getBackground(context: BrowserContext) {
	return (
		context.serviceWorkers()[0] ??
		context.backgroundPages()[0] ??
		(await Promise.race([
			context.waitForEvent('serviceworker', { timeout: 90000 }),
			context.waitForEvent('backgroundpage', { timeout: 90000 }),
		]))
	);
}

async function configureServer(context: BrowserContext, serverUrl: string) {
	const background = await getBackground(context);
	await background.evaluate(async (serverUrl) => {
		await chrome.storage.local.set({ serverSettings: { serverUrl, preferredVariants: '' } });
	}, serverUrl);
}

/**
 * Playwright cannot reach a Firefox extension's background script, so Firefox
 * runs against a build made with LT_DEFAULT_SERVER_URL pointing at the server.
 */
const FIREFOX_SKIP_REASON =
	'Firefox needs a build with LT_DEFAULT_SERVER_URL set (see `make test-firefox`)';

test('Highlights a mistake reported by the server and applies its suggestion', async ({
	browserName,
	context,
	page,
}) => {
	if (browserName === 'firefox') {
		test.skip(process.env.LT_DEFAULT_SERVER_URL == null, FIREFOX_SKIP_REASON);
	} else {
		await configureServer(context, MOCK_SERVER_URL);
	}
	await page.goto(TEST_PAGE_URL);

	const textarea = page.locator('textarea');
	await textarea.fill('Das ist ein Tset.');

	const highlight = page.locator('#inkling-highlight').first();
	await highlight.waitFor({ state: 'visible', timeout: 30000 });
	// Highlights let pointer events through to the editor, so click where the highlight is.
	const box = await highlight.boundingBox();
	expect(box).not.toBeNull();
	await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

	await page.locator('.inkling-popup').getByRole('menuitem', { name: 'Test', exact: true }).click();
	await expect(textarea).toHaveValue('Das ist ein Test.');
});

/** Type a text with one mistake and return the textarea and the center of its highlight. */
async function markMistake(
	browserName: string,
	context: BrowserContext,
	page: import('@playwright/test').Page,
) {
	if (browserName === 'firefox') {
		test.skip(process.env.LT_DEFAULT_SERVER_URL == null, FIREFOX_SKIP_REASON);
	} else {
		await configureServer(context, MOCK_SERVER_URL);
	}
	await page.goto(TEST_PAGE_URL);

	const textarea = page.locator('textarea');
	await textarea.fill('Das ist ein Tset.');
	const highlight = page.locator('#inkling-highlight').first();
	await highlight.waitFor({ state: 'visible', timeout: 30000 });
	const box = (await highlight.boundingBox())!;
	return { textarea, highlight, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('Clicking into a mistake keeps the caret in the text', async ({
	browserName,
	context,
	page,
}) => {
	const { textarea, x, y } = await markMistake(browserName, context, page);
	await page.mouse.click(x, y);

	const popup = page.locator('.inkling-popup');
	await expect(popup.getByRole('menuitem', { name: 'Test', exact: true })).toBeVisible();
	await expect(textarea).toBeFocused();

	// Typing goes into the text and closes the popup.
	await page.keyboard.type('x');
	await expect(textarea).not.toHaveValue('Das ist ein Tset.');
	await expect(textarea).toHaveValue(/^Das ist ein T.*x.*\.$/);
	await expect(popup).toBeHidden();
});

test('Escape closes the popup and leaves the caret in the text', async ({
	browserName,
	context,
	page,
}) => {
	const { textarea, x, y } = await markMistake(browserName, context, page);
	await page.mouse.click(x, y);
	const popup = page.locator('.inkling-popup');
	await expect(popup).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(popup).toBeHidden();
	await expect(textarea).toBeFocused();
	await expect(textarea).toHaveValue('Das ist ein Tset.');
});

test('An open card paints nothing in the middle of the page', async ({
	browserName,
	context,
	page,
}) => {
	const { x, y } = await markMistake(browserName, context, page);
	// A dark page shows any light patch the card leaves behind.
	await page.evaluate(() => {
		document.documentElement.style.background = '#1e3a5f';
	});
	const viewport = page.viewportSize()!;
	const middle = {
		x: viewport.width / 2 - 20,
		y: viewport.height / 2 - 20,
		width: 40,
		height: 40,
	};
	const closed = await page.screenshot({ clip: middle });

	await page.mouse.click(x, y);
	const popup = page.locator('.inkling-popup');
	await expect(popup).toBeVisible();
	expect(await page.screenshot({ clip: middle })).toEqual(closed);
});

test('The close button ignores the mistake', async ({ browserName, context, page }) => {
	const { x, y } = await markMistake(browserName, context, page);
	await page.mouse.click(x, y);

	await page.locator('.inkling-popup').getByRole('button', { name: 'Ignore' }).click();
	await expect(page.locator('#inkling-highlight')).toHaveCount(0);
});

test('Checks Markdown without its code and marks the right word', async ({
	browserName,
	context,
	page,
}) => {
	if (browserName === 'firefox') {
		test.skip(process.env.LT_DEFAULT_SERVER_URL == null, FIREFOX_SKIP_REASON);
	} else {
		await configureServer(context, MOCK_SERVER_URL);
	}
	await page.goto('http://localhost:18081/markdown_textarea.html');

	const textarea = page.locator('textarea');
	await textarea.fill('Ein `Tset` und **Tset** hier.');
	const highlight = page.locator('#inkling-highlight');
	await highlight.first().waitFor({ state: 'visible', timeout: 30000 });
	// The Tset in the code is markup, so only the bold one is marked.
	await page.waitForTimeout(1500);
	await expect(highlight).toHaveCount(1);

	const box = (await highlight.first().boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await page.locator('.inkling-popup').getByRole('menuitem', { name: 'Test', exact: true }).click();
	await expect(textarea).toHaveValue('Ein `Tset` und **Test** hier.');
});

test('Shows no highlights when no server is set', async ({ browserName, page }) => {
	test.skip(browserName === 'firefox', 'Firefox builds for the tests have a server compiled in');
	await page.goto(TEST_PAGE_URL);

	await page.locator('textarea').fill('Das ist ein Tset.');
	await page.waitForTimeout(3000);

	await expect(page.locator('#inkling-highlight')).toHaveCount(0);
});
