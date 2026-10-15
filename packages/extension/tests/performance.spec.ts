import type { Page } from '@playwright/test';
import { MOCK_SERVER_URL, storageSet } from './extensionPages';
import { expect, test } from './fixtures';

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'Firefox runs the same lint-framework code; Chromium lets the test set the server',
);

/** Type a few characters and return the median time from keydown to the next frame. */
async function medianKeystrokeMs(page: Page): Promise<number> {
	await page.evaluate(() => {
		const w = window as Window & { latencies?: number[] };
		w.latencies = [];
		document.addEventListener(
			'keydown',
			() => {
				const start = performance.now();
				requestAnimationFrame(() =>
					setTimeout(() => w.latencies!.push(performance.now() - start), 0),
				);
			},
			true,
		);
	});
	// Two bursts with a pause between them, so a check runs in between.
	for (let burst = 0; burst < 2; burst++) {
		for (const ch of 'und noch mehr Text ') {
			await page.keyboard.type(ch, { delay: 60 });
		}
		await page.waitForTimeout(1500);
	}
	const latencies = await page.evaluate(() =>
		(window as Window & { latencies?: number[] }).latencies!.toSorted((a, b) => a - b),
	);
	return latencies[Math.floor(latencies.length / 2)];
}

for (const kind of ['contenteditable', 'textarea']) {
	test(`Typing stays fast in a long ${kind} with 300 marks`, async ({ context, page }) => {
		await storageSet(context, {
			serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
		});
		await page.goto(`http://localhost:18081/long_text.html?kind=${kind}`);
		await page.bringToFront();
		const editor = page.locator(kind === 'textarea' ? '#field' : '#editor');
		await editor.click({ position: { x: 300, y: 100 } });
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						let n = 0;
						for (const host of document.querySelectorAll('#inkling-highlight-host')) {
							n += host.shadowRoot?.querySelectorAll('#inkling-highlight').length ?? 0;
						}
						return n;
					}),
				{ timeout: 30000 },
			)
			.toBeGreaterThan(10);

		// Before the fix this was over 2000 ms; a frame is 16 ms.
		expect(await medianKeystrokeMs(page)).toBeLessThan(250);
	});
}

test('Marks in a long contenteditable sit on the mistakes', async ({ context, page }) => {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
	});
	await page.goto('http://localhost:18081/long_text.html?kind=contenteditable');
	await page.bringToFront();
	await page.locator('#editor').click({ position: { x: 300, y: 100 } });
	// Typing moves the later marks, so their positions come from remapped spans.
	await page.keyboard.type('x');

	/** The words under the middle of each mark that is inside the visible part of the editor. */
	const markedWords = () =>
		page.evaluate(() => {
			const editor = document.getElementById('editor')!.getBoundingClientRect();
			const words: string[] = [];
			for (const host of document.querySelectorAll('#inkling-highlight-host')) {
				for (const mark of host.shadowRoot?.querySelectorAll('#inkling-highlight') ?? []) {
					const r = mark.getBoundingClientRect();
					if (r.bottom > editor.bottom || r.top < editor.top) continue;
					const pos = document.caretRangeFromPoint(r.x + r.width / 2, r.y + r.height / 2);
					const text = pos?.startContainer.textContent ?? '';
					const at = pos?.startOffset ?? 0;
					const start = text.lastIndexOf(' ', at - 1) + 1;
					const rest = text.slice(start).search(/[ ,.:]/);
					words.push(text.slice(start, rest < 0 ? undefined : start + rest));
				}
			}
			return words;
		});

	await expect
		.poll(async () => (await markedWords()).length, { timeout: 30000 })
		.toBeGreaterThan(10);
	const words = await markedWords();
	expect(words.filter((w) => w !== 'Tset')).toEqual([]);
});
