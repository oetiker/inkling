import { extensionId } from './extensionPages';
import { expect, test } from './fixtures';

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'The test loads the script from a chrome-extension:// address',
);

test('The Google Docs page script stops when told to', async ({ context, page }) => {
	await page.goto('http://localhost:18081/simple_contenteditable.html');
	const id = await extensionId(context);
	// The script polls for the editor; count its lookups.
	await page.evaluate((url) => {
		const w = window as Window & { editorLookups?: number };
		w.editorLookups = 0;
		const querySelector = Document.prototype.querySelector;
		Document.prototype.querySelector = function (this: Document, selector: string) {
			if (selector === '.kix-appview-editor') w.editorLookups!++;
			return querySelector.call(this, selector);
		} as typeof querySelector;
		const script = document.createElement('script');
		script.type = 'module';
		script.src = url;
		document.head.appendChild(script);
	}, `chrome-extension://${id}/google-docs-bridge.js`);
	const lookups = () =>
		page.evaluate(() => (window as Window & { editorLookups?: number }).editorLookups!);
	await expect.poll(lookups).toBeGreaterThan(2);

	await page.evaluate(() => document.dispatchEvent(new CustomEvent('inkling:gdocs:stop')));
	const atStop = await lookups();
	await page.waitForTimeout(500);
	expect(await lookups()).toBe(atStop);
	await expect(page.locator('#inkling-google-docs-main-world-bridge')).toHaveCount(0);
});
