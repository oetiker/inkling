import { createRequire } from 'node:module';
import { expect, test } from './fixtures';

// playwright-webextext installs the add-on over the remote debugging protocol; its client
// can reload it too, which unloads the running content scripts like an update does.
const require = createRequire(import.meta.url);
const remote = require('playwright-webextext/dist/firefox_remote.js');

const ADDON_ID = 'inkling@oetiker.ch';
/** One debugging port per worker, clear of the ports the other tests and tools use. */
const DEBUGGER_PORT_BASE = 18110;

test.skip(({ browserName }) => browserName !== 'firefox', 'Chrome does not inject again');
test.skip(
	process.env.LT_DEFAULT_SERVER_URL == null,
	'Firefox needs a build with LT_DEFAULT_SERVER_URL set (see `make test-firefox`)',
);

test.use({
	extraBrowserArgs: async ({ browserName: _ }, use, testInfo) =>
		use(['--start-debugger-server', String(DEBUGGER_PORT_BASE + testInfo.parallelIndex)]),
});

test('Reloading the extension leaves no stale marks in an open tab', async ({ page }, testInfo) => {
	await page.goto('http://localhost:18081/simple_textarea.html');
	const textarea = page.locator('textarea');
	await textarea.fill('Das ist ein Tset.');
	const marks = page.locator('#inkling-highlight');
	await expect(marks).toHaveCount(1, { timeout: 30000 });

	const client = await remote.connect(DEBUGGER_PORT_BASE + testInfo.parallelIndex);
	try {
		await client.reloadAddon(ADDON_ID);
	} finally {
		client.disconnect();
	}

	// The new instance marks the text again; the old instance's mark must not stay beside it.
	await textarea.press('End');
	await textarea.pressSequentially(' Noch ein Tset.');
	await expect(marks).toHaveCount(2, { timeout: 30000 });
	await page.waitForTimeout(2000);
	await expect(marks).toHaveCount(2);
	// One host for the marks and one for the suggestion card.
	await expect(page.locator('inkling-render-box')).toHaveCount(2);
});
