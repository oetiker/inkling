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
