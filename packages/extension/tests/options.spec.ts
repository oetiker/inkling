import {
	extensionId,
	MOCK_SERVER_URL,
	openOptions,
	storageGet,
	storageSet,
} from './extensionPages';
import { expect, test } from './fixtures';

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'Playwright cannot open Firefox extension pages',
);

test('Save and Test with the mock server shows the success message', async ({ context }) => {
	const page = await openOptions(context);
	await page.getByLabel('Server URL').fill(MOCK_SERVER_URL);
	await page.getByRole('button', { name: 'Save and Test' }).click();
	await expect(page.getByRole('alert')).toContainText('Connected: mock LanguageTool 0.0');
	expect(await storageGet(context, 'serverSettings')).toMatchObject({ serverUrl: MOCK_SERVER_URL });
});

test('An invalid server URL shows an error and saves nothing', async ({ context }) => {
	const page = await openOptions(context);
	await page.getByLabel('Server URL').fill('ftp://x');
	await page.getByRole('button', { name: 'Save and Test' }).click();
	await expect(page.getByRole('alert')).toContainText(
		'Enter a URL that starts with https:// or http://.',
	);
	expect(await storageGet(context, 'serverSettings')).toBeUndefined();
});

test('Fresh profile shows defaults', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page.getByLabel('Delay')).toHaveValue('500');
	await expect(page.getByRole('switch', { name: 'Enable on new sites' })).not.toBeChecked();
	await expect(page.getByLabel('User dictionary')).toHaveValue('');
	// The Chromium test build ships without a default server.
	await expect(page.getByLabel('Server URL')).toHaveValue('');
});

test.describe('install page', () => {
	test.use({ keepInstallPage: true });

	test('A fresh install without a server opens the settings page', async ({ context }) => {
		const id = await extensionId(context);
		await expect
			.poll(() => context.pages().some((p) => p.url() === `chrome-extension://${id}/options.html`))
			.toBe(true);
	});
});

test('Use public server fills in the public server and the hint goes away', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page.getByText('No server of your own?')).toBeVisible();
	await page.getByRole('button', { name: 'Use public server' }).click();
	await expect(page.getByLabel('Server URL')).toHaveValue('https://api.languagetool.org');
	await expect(page.getByText('No server of your own?')).toBeHidden();
	// Filling in the field saves nothing; "Save and Test" does.
	expect(await storageGet(context, 'serverSettings')).toBeUndefined();
});

test('The public server hint is hidden when a server is set', async ({ context }) => {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
	});
	const page = await openOptions(context);
	await expect(page.getByLabel('Server URL')).toHaveValue(MOCK_SERVER_URL);
	await expect(page.getByText('No server of your own?')).toBeHidden();
});

test('Settings survive a reload', async ({ context }) => {
	const page = await openOptions(context);
	await page.getByLabel('Delay').fill('750');
	await page.getByRole('switch', { name: 'Enable on new sites' }).click();
	await page.getByLabel('User dictionary').fill('Inkling\nOetiker');
	await expect.poll(() => storageGet(context, 'delay')).toBe(750);
	await expect.poll(() => storageGet(context, 'userDictionary')).toEqual(['Inkling', 'Oetiker']);

	await page.reload();
	await expect(page.getByLabel('Delay')).toHaveValue('750');
	await expect(page.getByRole('switch', { name: 'Enable on new sites' })).toBeChecked();
	await expect(page.getByLabel('User dictionary')).toHaveValue('Inkling\nOetiker');
});

test('Invalid delay is rejected', async ({ context }) => {
	await storageSet(context, { delay: 650 });
	const page = await openOptions(context);
	const delay = page.getByLabel('Delay');
	await expect(delay).toHaveValue('650');

	const message = page.getByText('Enter a whole number of milliseconds between 0 and 60000.');
	for (const bad of ['', '-5', '99999999', '60001']) {
		await delay.fill(bad);
		await expect(delay).toHaveAttribute('aria-invalid', 'true');
		await expect(message).toBeVisible();
	}
	expect(await storageGet(context, 'delay')).toBe(650);

	await delay.fill('60000');
	await expect(delay).toHaveAttribute('aria-invalid', 'false');
	await expect(message).toHaveCount(0);
	await expect.poll(() => storageGet(context, 'delay')).toBe(60000);
});

test('A changed delay takes effect in an open tab without a reload', async ({ context }) => {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
		delay: 60000,
	});
	const page = await context.newPage();
	await page.goto('http://localhost:18081/simple_textarea.html');
	await page.locator('textarea').fill('Das ist ein Tset.');
	// LintFramework re-checks every second, so a mark would show within this time.
	await page.waitForTimeout(3000);
	await expect(page.locator('#inkling-highlight')).toHaveCount(0);

	const options = await openOptions(context);
	await options.getByLabel('Delay').fill('0');
	await expect.poll(() => storageGet(context, 'delay')).toBe(0);
	await page.bringToFront();
	await expect(page.locator('#inkling-highlight').first()).toBeVisible({ timeout: 5000 });
});

test('Hotkey can be recorded and recording can be cancelled', async ({ context }) => {
	const page = await openOptions(context);
	const recorder = page.locator('#hotkey');
	// The button is named by its label and its current text.
	await expect(
		page.getByRole('button', { name: /Apply-suggestion hotkey.*Change hotkey/ }),
	).toBeVisible();
	await recorder.click();
	await expect(recorder).toHaveText('Press keys…');
	await expect(
		page.getByRole('button', { name: /Apply-suggestion hotkey.*Press keys/ }),
	).toBeVisible();
	await page.keyboard.press('Control+Shift+K');
	await expect
		.poll(() => storageGet(context, 'hotkey'))
		.toEqual({ modifiers: ['Ctrl', 'Shift'], key: 'K' });

	await recorder.click();
	await page.keyboard.press('Escape');
	await expect(recorder).toHaveText('Change hotkey');
	await page.keyboard.press('Control+Alt+J');
	expect(await storageGet(context, 'hotkey')).toEqual({ modifiers: ['Ctrl', 'Shift'], key: 'K' });
});

test('Activation key can be chosen and survives a reload', async ({ context }) => {
	const page = await openOptions(context);
	await page.locator('#activation-key').click();
	await page.getByRole('option', { name: 'Double Control' }).click();
	await expect(page.locator('#activation-key')).toHaveText('Double Control');
	await expect.poll(() => storageGet(context, 'activationKey')).toBe('control');

	await page.reload();
	await expect(page.locator('#activation-key')).toHaveText('Double Control');
});

test('Options page shows the logo and version', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page.getByRole('img', { name: 'Inkling logo' })).toBeVisible();
	await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
	expect(await extensionId(context)).toMatch(/^[a-p]{32}$/);
});

for (const [what, answer] of [
	['resolves false', 'deny'],
	['rejects', 'reject'],
] as const) {
	test(`A denied server permission says why the server was not saved (request ${what})`, async ({
		context,
	}) => {
		const page = await openOptions(context);
		// The test build holds the permission already, so act out the user clicking "Deny".
		await page.evaluate((answer) => {
			Object.defineProperty(chrome.permissions, 'request', {
				configurable: true,
				value: () =>
					answer === 'deny'
						? Promise.resolve(false)
						: Promise.reject(new Error('The permission dialog was closed')),
			});
		}, answer);
		await page.getByLabel('Server URL').fill(MOCK_SERVER_URL);
		await page.getByRole('button', { name: 'Save and Test' }).click();
		await expect(page.getByRole('alert')).toContainText(
			'Inkling needs access to http://127.0.0.1:18082 to send your text to the server.',
		);
		expect(await storageGet(context, 'serverSettings')).toBeUndefined();
	});
}

test('A failed save stays visible when another setting saves later', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page.getByLabel('Delay')).toHaveValue('500');
	// Delay saves fail at once while they are broken; other saves succeed, but only later.
	await page.evaluate(() => {
		const send = chrome.runtime.sendMessage.bind(chrome.runtime);
		const w = window as unknown as { breakDelay: boolean; enabledSaved: boolean };
		w.breakDelay = true;
		w.enabledSaved = false;
		Object.defineProperty(chrome.runtime, 'sendMessage', {
			configurable: true,
			value: async (message: { kind: string }) => {
				if (message.kind === 'setDelay' && w.breakDelay) {
					throw new Error('storage is full');
				}
				if (message.kind === 'setDefaultStatus') {
					await new Promise((resolve) => setTimeout(resolve, 500));
					const response = await send(message);
					w.enabledSaved = true;
					return response;
				}
				return send(message);
			},
		});
	});

	await page.getByRole('switch', { name: 'Enable on new sites' }).click();
	await page.getByLabel('Delay').fill('750');
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { enabledSaved: boolean }).enabledSaved))
		.toBe(true);
	// Let the page handle the late success before looking.
	await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
	await expect(page.getByRole('alert')).toContainText('Could not save "Delay"');
	await expect(page.getByRole('alert')).toContainText('storage is full');

	// Saving the same setting again clears its message.
	await page.evaluate(() => {
		(window as unknown as { breakDelay: boolean }).breakDelay = false;
	});
	await page.getByLabel('Delay').fill('800');
	await expect.poll(() => storageGet(context, 'delay')).toBe(800);
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('A failed export says why', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page.getByLabel('Delay')).toHaveValue('500');
	await page.evaluate(() => {
		const send = chrome.runtime.sendMessage.bind(chrome.runtime);
		Object.defineProperty(chrome.runtime, 'sendMessage', {
			configurable: true,
			value: async (message: { kind: string }) => {
				if (message.kind === 'getEnabledDomains') {
					throw new Error('storage is broken');
				}
				return send(message);
			},
		});
	});
	await page.getByRole('button', { name: 'Export enabled domains' }).click();
	await expect(page.getByRole('alert')).toContainText(
		'Could not export the enabled domains: storage is broken',
	);
});

test('Options page links to the source code', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page.getByRole('link', { name: 'github.com/oetiker/inkling' })).toHaveAttribute(
		'href',
		'https://github.com/oetiker/inkling',
	);
});

test.describe('language settings', () => {
	test('Without a server the language card asks for one', async ({ context }) => {
		const page = await openOptions(context);
		await expect(
			page.getByText('Inkling reads the available languages from the server. Save a server first.'),
		).toBeVisible();
		await expect(page.locator('#variant-de')).toHaveCount(0);
	});

	test('Variants follow the browser until changed, and the check sends the settings', async ({
		context,
	}) => {
		await storageSet(context, { serverSettings: { serverUrl: MOCK_SERVER_URL } });
		const page = await openOptions(context);
		// Playwright's Chromium speaks en-US; the server knows that variant.
		await expect(page.locator('#variant-en')).toHaveText('American English (en-US)');
		await expect(page.locator('#variant-de')).toHaveText('Server default');
		expect(await storageGet(context, 'languageSettings')).toBeUndefined();

		await page.locator('#variant-de').click();
		await page.getByRole('option', { name: 'Swiss High German (de-CH)' }).click();
		await page
			.getByRole('group', { name: 'Preferred languages' })
			.getByRole('button', { name: 'German', exact: true })
			.click();
		await page.locator('#mother-tongue').click();
		await page.getByRole('option', { name: 'French', exact: true }).click();
		await page.getByRole('switch', { name: 'Picky mode' }).click();
		await expect
			.poll(() => storageGet(context, 'languageSettings'))
			.toEqual({
				variants: { de: 'de-CH', en: 'en-US' },
				preferredLanguages: ['de'],
				motherTongue: 'fr',
				picky: true,
			});

		await page.reload();
		await expect(page.locator('#variant-de')).toHaveText('Swiss High German (de-CH)');
		await expect(
			page
				.getByRole('group', { name: 'Preferred languages' })
				.getByRole('button', { name: 'German', exact: true }),
		).toHaveAttribute('aria-pressed', 'true');

		const tab = await context.newPage();
		await tab.goto('http://localhost:18081/simple_textarea.html');
		const text = 'Die Sprache dieses Tset.';
		await tab.locator('textarea').fill(text);
		await expect(tab.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });
		const sent = await (
			await fetch(`${MOCK_SERVER_URL}/last-check?text=${encodeURIComponent(text)}`)
		).json();
		expect(sent).toMatchObject({
			language: 'auto',
			preferredVariants: 'de-CH,en-US',
			preferredLanguages: 'de',
			motherTongue: 'fr',
			level: 'picky',
		});
	});
});
