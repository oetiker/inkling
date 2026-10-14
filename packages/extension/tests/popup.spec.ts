import type { BrowserContext, Page } from '@playwright/test';
import { getBackground, MOCK_SERVER_URL, storageGet, storageSet } from './extensionPages';
import { expect, test } from './fixtures';

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'Playwright cannot open Firefox extension pages',
);

const PAGE = 'simple_textarea.html';

async function markedPage(context: BrowserContext, url: string): Promise<Page> {
	const page = await context.newPage();
	await page.goto(url);
	await page.locator('textarea').fill('Das ist ein Tset.');
	await expect(page.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });
	return page;
}

// Protocol messages are sent from an extension page, not from the service worker:
// chrome.runtime.sendMessage in the worker does not reach the worker's own listener.
test('Site switch works on a www. host and takes effect at once', async ({ context }) => {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
		'domainStatus www.localhost': true,
	});
	const page = await markedPage(context, `http://www.localhost:18081/${PAGE}`);

	const ext = await context.newPage();
	await ext.goto(
		`chrome-extension://${new URL((await getBackground(context)).url()).host}/options.html`,
	);
	await ext.evaluate(() =>
		chrome.runtime.sendMessage({
			kind: 'setDomainStatus',
			domain: 'www.localhost',
			enabled: false,
			overrideValue: true,
		}),
	);
	expect(await storageGet(context, 'domainStatus www.localhost')).toBe(false);

	await page.bringToFront();
	await expect(page.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
});
