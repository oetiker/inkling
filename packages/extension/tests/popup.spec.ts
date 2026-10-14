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

/** Sends a protocol message from an extension page (the worker cannot message itself). */
async function sendFromExtension(context: BrowserContext, message: unknown): Promise<unknown> {
	const background = await getBackground(context);
	const ext = await context.newPage();
	await ext.goto(`chrome-extension://${new URL(background.url()).host}/options.html`);
	const result = await ext.evaluate((m) => chrome.runtime.sendMessage(m), message);
	await ext.close();
	return result;
}

async function tabIdOf(context: BrowserContext, urlPart: string): Promise<number> {
	const background = await getBackground(context);
	return background.evaluate(async (urlPart) => {
		const tabs = await chrome.tabs.query({});
		const tab = tabs.find((t) => t.url?.includes(urlPart));
		if (tab?.id == null) throw new Error(`no tab with ${urlPart}`);
		return tab.id;
	}, urlPart);
}

async function setupServer(context: BrowserContext) {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
	});
}

test('Pausing one tab removes its marks and leaves the other tab alone', async ({ context }) => {
	await setupServer(context);
	const a = await markedPage(context, `http://localhost:18081/${PAGE}?tab=a`);
	const b = await markedPage(context, `http://localhost:18081/${PAGE}?tab=b`);
	const idA = await tabIdOf(context, '?tab=a');

	await sendFromExtension(context, { kind: 'setTabPaused', tabId: idA, paused: true });
	expect(await sendFromExtension(context, { kind: 'getTabPaused', tabId: idA })).toMatchObject({
		paused: true,
	});

	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
	await b.bringToFront();
	await expect(b.locator('#inkling-highlight').first()).toBeVisible();

	await sendFromExtension(context, { kind: 'setTabPaused', tabId: idA, paused: false });
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight').first()).toBeVisible({ timeout: 5000 });
});

test('A pause survives pushState and ends on reload', async ({ context }) => {
	await setupServer(context);
	const a = await markedPage(context, `http://localhost:18081/${PAGE}?tab=a`);
	const idA = await tabIdOf(context, '?tab=a');
	await sendFromExtension(context, { kind: 'setTabPaused', tabId: idA, paused: true });
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });

	await a.evaluate(() => history.pushState({}, '', '?tab=a&spa=1'));
	await a.waitForTimeout(1500);
	expect(await sendFromExtension(context, { kind: 'getTabPaused', tabId: idA })).toMatchObject({
		paused: true,
	});

	await a.reload();
	await expect
		.poll(async () => sendFromExtension(context, { kind: 'getTabPaused', tabId: idA }))
		.toMatchObject({ paused: false });
	await a.locator('textarea').fill('Das ist ein Tset.');
	await expect(a.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });
});

test('A pause covers frames inside the tab', async ({ context }) => {
	await setupServer(context);
	const page = await context.newPage();
	await page.goto('http://localhost:18081/iframe_textarea.html');
	const frame = page.frameLocator('iframe[title="editor"]');
	await frame.locator('textarea').fill('Das ist ein Tset.');
	await expect(frame.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });

	const id = await tabIdOf(context, 'iframe_textarea.html');
	await sendFromExtension(context, { kind: 'setTabPaused', tabId: id, paused: true });
	await page.bringToFront();
	await expect(frame.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
});
