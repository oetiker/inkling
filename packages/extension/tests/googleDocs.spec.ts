import type { BrowserContext, Page } from '@playwright/test';
import { storageSet } from './extensionPages';
import { expect, test } from './fixtures';

const MOCK_SERVER_URL = 'http://127.0.0.1:18082';
const DOC_URL = 'https://docs.google.com/document/d/inkling-test/edit';
const FONT = '16px Arial';
const LINE_LEFT = 40;

/**
 * A stand-in for a Google Docs editor: one line of text drawn as an SVG rect with an
 * aria-label, the annotated text API the extension reads, and the hidden iframe whose
 * editable element takes pastes. A paste replaces the selected text, as in Docs.
 */
function fakeDocsPage(text: string): string {
	return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0">
<div class="kix-appview-editor" style="position:relative;width:800px;height:300px;overflow:auto">
	<svg width="800" height="200">
		<rect id="line" data-font-css="${FONT}" x="${LINE_LEFT}" y="40" height="20" fill="transparent"></rect>
	</svg>
</div>
<iframe class="docs-texteventtarget-iframe" style="position:absolute;top:-1000px"></iframe>
<script>
	window.docText = ${JSON.stringify(text)};
	const line = document.getElementById('line');
	const measure = document.createElement('canvas').getContext('2d');
	measure.font = ${JSON.stringify(FONT)};
	function drawLine() {
		line.setAttribute('aria-label', window.docText);
		line.setAttribute('width', String(measure.measureText(window.docText).width));
	}
	drawLine();
	// Offsets count the leading \\u0003 that Docs puts before the text.
	let selection = { start: 1, end: 1 };
	const annotated = {
		getText: () => '\\u0003' + window.docText + '\\n',
		setSelection: (start, end) => { selection = { start, end }; },
		getSelection: () => [{ ...selection }],
	};
	window._docs_annotate_getAnnotatedText = async () => annotated;

	const iframeDocument = document.querySelector('iframe').contentDocument;
	iframeDocument.body.innerHTML = '<div contenteditable="true"></div>';
	iframeDocument.querySelector('[contenteditable]').addEventListener('paste', (event) => {
		event.preventDefault();
		const pasted = event.clipboardData.getData('text/plain');
		window.docText =
			window.docText.slice(0, selection.start - 1) + pasted + window.docText.slice(selection.end - 1);
		drawLine();
	});
</script>
</body></html>`;
}

/** Open the stand-in Docs page with `text` and wait for the first mark. */
async function openDoc(browserName: string, context: BrowserContext, page: Page, text: string) {
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
	await context.route(DOC_URL, (route) =>
		route.fulfill({ contentType: 'text/html', body: fakeDocsPage(text) }),
	);
	await page.goto(DOC_URL);

	const highlight = page.locator('#inkling-highlight').first();
	await highlight.waitFor({ state: 'visible', timeout: 30000 });
	return highlight;
}

test('Applies a suggestion in a Google Docs document', async ({ browserName, context, page }) => {
	const highlight = await openDoc(browserName, context, page, 'Das ist ein Tset.');
	const box = (await highlight.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await page.locator('.inkling-popup').getByRole('menuitem', { name: 'Test', exact: true }).click();

	await expect
		.poll(() => page.evaluate(() => (window as Window & { docText?: string }).docText))
		.toBe('Das ist ein Test.');
});

test('Marks the right word after quotes, brackets and dashes in Google Docs', async ({
	browserName,
	context,
	page,
}) => {
	const text = `Er sagte "ja" und 'nein' ( vielleicht ) a - b a / b ein Tset.`;
	const highlight = await openDoc(browserName, context, page, text);

	// The text Inkling checks keeps every space of the document.
	await expect(page.locator('#inkling-google-docs-target')).toHaveText(text);
	const expectedLeft = await page.evaluate(
		({ text, font, lineLeft }) => {
			const measure = document.createElement('canvas').getContext('2d')!;
			measure.font = font;
			const editor = document.querySelector('.kix-appview-editor')!.getBoundingClientRect();
			return (
				editor.left + lineLeft + measure.measureText(text.slice(0, text.indexOf('Tset'))).width
			);
		},
		{ text, font: FONT, lineLeft: LINE_LEFT },
	);
	const box = (await highlight.boundingBox())!;
	expect(Math.abs(box.x - expectedLeft)).toBeLessThan(2);
});
