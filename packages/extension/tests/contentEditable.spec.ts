import { storageSet } from './extensionPages';
import { expect, test } from './fixtures';

const MOCK_SERVER_URL = 'http://127.0.0.1:18082';
const TEST_PAGE_URL = 'http://localhost:18081/block_contenteditable.html';
const MISTAKES = 7;

test.beforeEach(async ({ browserName, context }) => {
	if (browserName === 'firefox') {
		test.skip(
			process.env.LT_DEFAULT_SERVER_URL == null,
			'Firefox needs a build with LT_DEFAULT_SERVER_URL set (see `make test-firefox`)',
		);
	} else {
		await storageSet(context, {
			serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
		});
	}
});

/** For each mark, how far it is from the nearest "Tset" in the editor, in pixels. */
function markOffsets(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const editor = document.querySelector('[contenteditable]')!;
		const words: DOMRect[] = [];
		const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
			const text = node.textContent ?? '';
			for (let at = text.indexOf('Tset'); at !== -1; at = text.indexOf('Tset', at + 1)) {
				const range = document.createRange();
				range.setStart(node, at);
				range.setEnd(node, at + 4);
				words.push(range.getBoundingClientRect());
			}
		}
		const offsets: number[] = [];
		for (const host of document.querySelectorAll('#inkling-highlight-host')) {
			for (const mark of host.shadowRoot?.querySelectorAll('#inkling-highlight') ?? []) {
				const r = mark.getBoundingClientRect();
				offsets.push(
					Math.min(...words.map((w) => Math.abs(w.left - r.left) + Math.abs(w.top - r.top))),
				);
			}
		}
		return offsets;
	});
}

test('Marks sit on the mistakes in an editor with a div or paragraph per line', async ({
	page,
}) => {
	await page.goto(TEST_PAGE_URL);
	// A keystroke makes Inkling pick up the editor.
	await page.locator('[contenteditable] > div').first().click();
	await page.keyboard.press('End');
	await page.keyboard.type('!');

	await expect
		.poll(async () => (await markOffsets(page)).length, { timeout: 30000 })
		.toBe(MISTAKES);
	for (const offset of await markOffsets(page)) {
		expect(offset).toBeLessThan(3);
	}
});

test('Applying a suggestion in such an editor replaces only the mistake', async ({ page }) => {
	await page.goto(TEST_PAGE_URL);
	const editor = page.locator('[contenteditable]');
	await page.locator('[contenteditable] > div').first().click();
	await page.keyboard.press('End');
	await page.keyboard.type('!');
	await expect
		.poll(async () => (await markOffsets(page)).length, { timeout: 30000 })
		.toBe(MISTAKES);

	const lastLine = page.locator('[contenteditable] > div').last();
	const word = await lastLine.evaluate((line) => {
		const node = line.firstChild!;
		const range = document.createRange();
		const at = node.textContent!.indexOf('Tset');
		range.setStart(node, at);
		range.setEnd(node, at + 4);
		const r = range.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	});
	await page.mouse.click(word.x, word.y);
	await page.locator('.inkling-popup').getByRole('menuitem', { name: 'Test', exact: true }).click();

	await expect(lastLine).toHaveText('Am Ende ein letzter Test.');
	await expect(editor).toContainText('Hallo Christoph!');
	await expect(editor).toContainText('Christoph Tset');
});
