import { evaluate, listenerTypes, pageWithMistake } from './contentScriptWorld';
import { expect, test } from './fixtures';

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'The DevTools protocol reaches the content script only in Chromium',
);

test('A text field removed from the page loses its listeners', async ({ context }) => {
	const { page, cdp, errors, contentScript } = await pageWithMistake(
		context,
		'simple_textarea.html',
		'textarea',
	);
	await expect(page.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });
	expect(await listenerTypes(cdp, contentScript, 'document.querySelector("textarea")')).toContain(
		'input',
	);

	// Keep the node reachable after the page dropped it, as a single-page app would.
	await evaluate(cdp, contentScript, 'window.removedField = document.querySelector("textarea")');
	await page.evaluate(() => document.querySelector('textarea')!.remove());

	await expect
		.poll(() => listenerTypes(cdp, contentScript, 'window.removedField'), { timeout: 10000 })
		.toEqual([]);
	expect(errors).toEqual([]);
});
