import { evaluate, listenerTypes, pageWithMistake } from './contentScriptWorld';
import { openOptions } from './extensionPages';
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

test('A site turned off reads no text, and checks again once turned on', async ({ context }) => {
	const { page, cdp, errors, contentScript } = await pageWithMistake(
		context,
		'simple_contenteditable.html',
		'[contenteditable]',
		{ 'domainStatus localhost': false },
	);
	// Count the reads of the content script; the page's own world has its own prototype.
	await evaluate(
		cdp,
		contentScript,
		`(() => {
			window.innerTextReads = 0;
			const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
			Object.defineProperty(HTMLElement.prototype, 'innerText', {
				...original,
				get() {
					window.innerTextReads++;
					return original.get.call(this);
				},
			});
		})()`,
	);
	await page.locator('[contenteditable]').pressSequentially(' Noch ein Tset.');
	await page.waitForTimeout(2000);
	expect(await evaluate(cdp, contentScript, 'window.innerTextReads')).toBe(0);
	await expect(page.locator('#inkling-highlight')).toHaveCount(0);

	const options = await openOptions(context);
	await options.evaluate(() =>
		chrome.runtime.sendMessage({
			kind: 'setDomainStatus',
			domain: 'localhost',
			enabled: true,
			overrideValue: true,
		}),
	);
	await options.close();
	await expect(page.locator('#inkling-highlight').first()).toBeVisible({ timeout: 10000 });
	expect(errors).toEqual([]);
});
