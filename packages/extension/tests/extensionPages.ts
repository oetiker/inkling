import type { BrowserContext, Page, Worker } from '@playwright/test';

/** The mock LanguageTool server started by playwright.config.ts. Never LT_TEST_SERVER here. */
export const MOCK_SERVER_URL = 'http://127.0.0.1:18082';

export async function getBackground(context: BrowserContext): Promise<Worker> {
	return (
		context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 90000 }))
	);
}

export async function extensionId(context: BrowserContext): Promise<string> {
	const background = await getBackground(context);
	return new URL(background.url()).host;
}

export async function storageGet(context: BrowserContext, key: string): Promise<unknown> {
	const background = await getBackground(context);
	return background.evaluate(async (key) => (await chrome.storage.local.get(key))[key], key);
}

export async function storageSet(
	context: BrowserContext,
	items: Record<string, unknown>,
): Promise<void> {
	const background = await getBackground(context);
	await background.evaluate(async (items) => {
		await chrome.storage.local.set(items);
	}, items);
}

export async function openOptions(context: BrowserContext): Promise<Page> {
	const page = await context.newPage();
	await page.goto(`chrome-extension://${await extensionId(context)}/options.html`);
	return page;
}
