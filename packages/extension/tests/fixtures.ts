import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { type BrowserContext, test as base, expect } from '@playwright/test';
import { withExtension } from 'playwright-webextext';

const pathToExtension = path.join(import.meta.dirname, '../build');

const test = base.extend<{ keepInstallPage: boolean; extraBrowserArgs: string[] }>({
	/** Leave open the settings page that a fresh install without a server opens. */
	keepInstallPage: [false, { option: true }],
	/** Command line arguments for the browser on top of the configured ones. */
	extraBrowserArgs: [[], { option: true }],
	context: async (
		{
			playwright,
			browserName,
			contextOptions,
			launchOptions,
			headless,
			keepInstallPage,
			extraBrowserArgs,
		},
		use,
		testInfo,
	) => {
		if (browserName === 'chromium' && headless) {
			throw new Error('Chromium extensions require headed mode');
		}

		const profile = testInfo.outputPath('browser-profile');
		await mkdir(profile, { recursive: true });

		const browserType = withExtension(playwright[browserName], pathToExtension);
		const context = await browserType.launchPersistentContext(profile, {
			...contextOptions,
			...launchOptions,
			args: [
				...(launchOptions.args ?? []),
				...extraBrowserArgs,
				// Without a port of its own, every Firefox would try 6000 and the add-on could be
				// installed into another worker's browser.
				...(browserName === 'firefox' ? ['--start-debugger-server', String(await freePort())] : []),
			],
			headless,
		});

		try {
			// Only the Chromium test build ships without a default server; its install page
			// would sit in front of the tab under test.
			if (browserName === 'chromium' && !keepInstallPage) {
				await closeInstallPage(context);
			}
			await use(context);
		} finally {
			await context.close();
			await rm(profile, { recursive: true, force: true });
		}
	},
});

/** A TCP port no one listens on right now. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as { port: number };
			server.close(() => resolve(port));
		});
	});
}

async function closeInstallPage(context: BrowserContext): Promise<void> {
	// The tab can show up as about:blank first, so look for the URL rather than the page event.
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline) {
		const page = context.pages().find((p) => p.url().endsWith('/options.html'));
		if (page != null) {
			// Closing the last tab would close the browser window.
			await context.newPage();
			await page.close();
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error('The install page did not open');
}

export { test, expect };
