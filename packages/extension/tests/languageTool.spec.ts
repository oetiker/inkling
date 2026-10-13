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

	const highlight = page.locator('#harper-highlight').first();
	await highlight.waitFor({ state: 'visible', timeout: 30000 });
	// Highlights let pointer events through to the editor, so click where the highlight is.
	const box = await highlight.boundingBox();
	expect(box).not.toBeNull();
	await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

	await page
		.locator('.harper-container')
		.getByRole('menuitem', { name: 'Test', exact: true })
		.click();
	await expect(textarea).toHaveValue('Das ist ein Test.');
});

test('Shows no highlights when no server is set', async ({ browserName, page }) => {
	test.skip(browserName === 'firefox', 'Firefox builds for the tests have a server compiled in');
	await page.goto(TEST_PAGE_URL);

	await page.locator('textarea').fill('Das ist ein Tset.');
	await page.waitForTimeout(3000);

	await expect(page.locator('#harper-highlight')).toHaveCount(0);
});
