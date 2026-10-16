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

async function openPopupFor(context: BrowserContext, tabId: number): Promise<Page> {
	const background = await getBackground(context);
	const popup = await context.newPage();
	await popup.goto(`chrome-extension://${new URL(background.url()).host}/popup.html?tab=${tabId}`);
	return popup;
}

test('Popup turns a site off and on', async ({ context }) => {
	await setupServer(context);
	const a = await markedPage(context, `http://localhost:18081/${PAGE}?tab=a`);
	const popup = await openPopupFor(context, await tabIdOf(context, '?tab=a'));

	await expect(popup.getByText('localhost', { exact: true })).toBeVisible();
	const site = popup.getByRole('switch', { name: 'Check this site' });
	await expect(site).toBeChecked();
	await expect(popup.getByText('Checking is on')).toBeVisible();

	await site.click();
	await expect(popup.getByText('Off for this site')).toBeVisible();
	await expect(popup.getByRole('button', { name: 'Pause in this tab' })).toHaveCount(0);
	expect(await storageGet(context, 'domainStatus localhost')).toBe(false);
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
});

test('Popup site switch works on a www. host and takes effect at once', async ({ context }) => {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
		'domainStatus www.localhost': true,
	});
	const a = await markedPage(context, `http://www.localhost:18081/${PAGE}?tab=a`);
	const popup = await openPopupFor(context, await tabIdOf(context, '?tab=a'));

	await expect(popup.getByText('localhost', { exact: true })).toBeVisible();
	const site = popup.getByRole('switch', { name: 'Check this site' });
	await expect(site).toBeChecked();

	await site.click();
	await expect(popup.getByText('Off for this site')).toBeVisible();
	expect(await storageGet(context, 'domainStatus www.localhost')).toBe(false);
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
});

test('Popup pauses and resumes the tab; turning the site off ends the pause', async ({
	context,
}) => {
	await setupServer(context);
	const a = await markedPage(context, `http://localhost:18081/${PAGE}?tab=a`);
	const idA = await tabIdOf(context, '?tab=a');
	const popup = await openPopupFor(context, idA);

	await popup.getByRole('button', { name: 'Pause in this tab' }).click();
	await expect(popup.getByText('Paused in this tab')).toBeVisible();
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });

	await popup.bringToFront();
	await popup.getByRole('button', { name: 'Resume in this tab' }).click();
	await expect(popup.getByText('Checking is on')).toBeVisible();

	await popup.getByRole('button', { name: 'Pause in this tab' }).click();
	const site = popup.getByRole('switch', { name: 'Check this site' });
	await site.click();
	await site.click();
	expect(await sendFromExtension(context, { kind: 'getTabPaused', tabId: idA })).toMatchObject({
		paused: false,
	});
	await expect(popup.getByText('Checking is on')).toBeVisible();
});

test('Popup shows a hint when no server is set', async ({ context }) => {
	const a = await context.newPage();
	await a.goto(`http://localhost:18081/${PAGE}?tab=a`);
	const popup = await openPopupFor(context, await tabIdOf(context, '?tab=a'));
	await expect(popup.getByRole('alert')).toContainText('No LanguageTool server is set');
	await expect(popup.getByRole('switch', { name: 'Check this site' })).toHaveCount(0);
});

test('Popup says so when it cannot load the server setting', async ({ context }) => {
	const a = await context.newPage();
	await a.goto(`http://localhost:18081/${PAGE}?tab=a`);
	const id = await tabIdOf(context, '?tab=a');
	const background = await getBackground(context);
	// Make the background fail to read the server setting, as a broken storage would.
	await background.evaluate(() => {
		const get = chrome.storage.local.get.bind(chrome.storage.local);
		Object.defineProperty(chrome.storage.local, 'get', {
			configurable: true,
			value: (keys: unknown) =>
				keys != null && typeof keys === 'object' && 'serverSettings' in keys
					? Promise.reject(new Error('storage is broken'))
					: get(keys as string),
		});
	});
	const popup = await openPopupFor(context, id);
	await expect(popup.getByRole('alert')).toContainText(
		'Could not load the settings: storage is broken',
	);
	await expect(popup.getByRole('switch', { name: 'Check this site' })).toHaveCount(0);
});

test('Popup says so when it cannot load whether the site is on', async ({ context }) => {
	await setupServer(context);
	const a = await context.newPage();
	await a.goto(`http://localhost:18081/${PAGE}?tab=a`);
	const id = await tabIdOf(context, '?tab=a');
	const background = await getBackground(context);
	// Make the background fail to read the site status, as a broken storage would.
	await background.evaluate(() => {
		const get = chrome.storage.local.get.bind(chrome.storage.local);
		Object.defineProperty(chrome.storage.local, 'get', {
			configurable: true,
			value: (keys: unknown) =>
				Array.isArray(keys) && keys.some((k) => String(k).startsWith('domainStatus '))
					? Promise.reject(new Error('storage is broken'))
					: get(keys as string),
		});
	});
	const popup = await openPopupFor(context, id);
	await expect(popup.getByRole('alert')).toContainText(
		'Could not load the state of this site: storage is broken',
	);
	await expect(popup.getByRole('switch', { name: 'Check this site' })).toHaveCount(0);
	await expect(popup.getByText('Off for this site')).toHaveCount(0);
});

test('Popup says so when it cannot load whether the tab is paused', async ({ context }) => {
	await setupServer(context);
	const a = await context.newPage();
	await a.goto(`http://localhost:18081/${PAGE}?tab=a`);
	const id = await tabIdOf(context, '?tab=a');
	const background = await getBackground(context);
	// Make the background fail to read the pause, as a broken storage would.
	await background.evaluate(() => {
		Object.defineProperty(chrome.storage.session, 'get', {
			configurable: true,
			value: () => Promise.reject(new Error('storage is broken')),
		});
	});
	const popup = await openPopupFor(context, id);
	await expect(popup.getByRole('alert')).toContainText(
		'Could not load the state of this site: storage is broken',
	);
	await expect(popup.getByRole('switch', { name: 'Check this site' })).toHaveCount(0);
	await expect(popup.getByRole('button', { name: 'Pause in this tab' })).toHaveCount(0);
});

test('Popup cannot act on about:blank', async ({ context }) => {
	await setupServer(context);
	const blank = await context.newPage();
	await blank.goto('about:blank');
	const background = await getBackground(context);
	const id = await background.evaluate(async () => {
		const tabs = await chrome.tabs.query({});
		return tabs.find((t) => t.url === 'about:blank')!.id!;
	});
	const popup = await openPopupFor(context, id);
	await expect(popup.getByText('Inkling cannot check this page')).toBeVisible();
	await expect(popup.getByRole('switch', { name: 'Check this site' })).toBeDisabled();
	await expect(popup.getByRole('button', { name: 'Pause in this tab' })).toBeDisabled();
});

test('Popup shows the cannot-check state when the tab cannot be read', async ({ context }) => {
	await setupServer(context);
	const popup = await openPopupFor(context, 999999);
	await expect(popup.getByText('Inkling cannot check this page')).toBeVisible();
	await expect(popup.getByRole('switch', { name: 'Check this site' })).toBeDisabled();
});

test('Popup shows the logo and opens the settings', async ({ context }) => {
	await setupServer(context);
	const a = await context.newPage();
	await a.goto(`http://localhost:18081/${PAGE}?tab=a`);
	const popup = await openPopupFor(context, await tabIdOf(context, '?tab=a'));
	await expect(popup.getByRole('img', { name: 'Inkling logo' })).toBeVisible();
	const optionsPage = context.waitForEvent('page');
	await popup.getByRole('button', { name: 'Settings' }).click();
	expect((await optionsPage).url()).toContain('/options.html');
});

test('A failing background handler answers with an error instead of hanging', async ({
	context,
}) => {
	// setHotkey without a hotkey makes the handler throw.
	const result = await sendFromExtension(context, { kind: 'setHotkey' });
	expect(result).toMatchObject({ kind: 'error' });
});
