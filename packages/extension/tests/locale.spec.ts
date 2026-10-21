import { MOCK_SERVER_URL, openOptions, storageSet } from './extensionPages';
import { expect, test } from './fixtures';

// Playwright's Firefox comes without German, so it would show English anyway.
test.skip(({ browserName }) => browserName !== 'chromium', 'Needs a browser with German');

test.describe('German browser', () => {
	// Playwright's Chromium 156 has no de-CH interface and falls back to English for it.
	test.use({ uiLocale: 'de' });

	test('The settings page is in German', async ({ context }) => {
		const page = await openOptions(context);
		await expect(page).toHaveTitle('Inkling-Einstellungen');
		await expect(page.locator('html')).toHaveAttribute('lang', /^de/);
		await expect(page.getByRole('button', { name: 'Speichern und testen' })).toBeVisible();
		await expect(page.getByLabel('Verzögerung')).toHaveValue('500');
		await expect(page.getByText('Kein eigener Server?')).toContainText(
			'«Lokalen Server verwenden»',
		);
		await expect(page.getByText('Nur zum Ausprobieren?')).toContainText(
			'den öffentlichen Server von LanguageTool.',
		);
	});

	test('The suggestion card is in German', async ({ context }) => {
		await storageSet(context, {
			serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
		});
		const page = await context.newPage();
		await page.goto('http://localhost:18081/simple_textarea.html');
		await page.locator('textarea').fill('Das ist ein Tset.');
		const highlight = page.locator('#inkling-highlight').first();
		await highlight.waitFor({ state: 'visible', timeout: 30000 });
		const box = (await highlight.boundingBox())!;
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

		const card = page.locator('.inkling-popup');
		await expect(card.getByRole('button', { name: 'Ignorieren' })).toBeVisible();
		await expect(card.getByRole('button', { name: 'Zum Wörterbuch hinzufügen' })).toBeVisible();
		await expect(card.getByRole('button', { name: 'Einstellungen' })).toBeVisible();
		await expect(card.getByRole('menu', { name: 'Vorschläge' })).toBeVisible();
		await expect(card.getByRole('menuitem', { name: 'Test', exact: true })).toHaveAttribute(
			'title',
			'«Tset» durch «Test» ersetzen',
		);
	});
});

test('An English browser shows the settings page in English', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page).toHaveTitle('Inkling Settings');
	await expect(page.getByRole('button', { name: 'Save and Test' })).toBeVisible();
});
