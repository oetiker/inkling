import { storageSet } from './extensionPages';
import { expect, test } from './fixtures';

const MOCK_SERVER_URL = 'http://127.0.0.1:18082';
const DOC_URL = 'https://docs.google.com/document/d/inkling-test/edit';

/**
 * A stand-in for a Google Docs editor: one line of text drawn as an SVG rect with an
 * aria-label, the annotated text API the extension reads, and the hidden iframe whose
 * editable element takes pastes. A paste replaces the selected text, as in Docs.
 */
const FAKE_DOCS_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0">
<div class="kix-appview-editor" style="position:relative;width:800px;height:300px;overflow:auto">
	<svg width="800" height="200">
		<rect id="line" aria-label="Das ist ein Tset." data-font-css="16px Arial"
			x="40" y="40" width="300" height="20" fill="transparent"></rect>
	</svg>
</div>
<iframe class="docs-texteventtarget-iframe" style="position:absolute;top:-1000px"></iframe>
<script>
	window.docText = 'Das ist ein Tset.';
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
		document.getElementById('line').setAttribute('aria-label', window.docText);
	});
</script>
</body></html>`;

test('Applies a suggestion in a Google Docs document', async ({ browserName, context, page }) => {
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
		route.fulfill({ contentType: 'text/html', body: FAKE_DOCS_PAGE }),
	);
	await page.goto(DOC_URL);

	const highlight = page.locator('#inkling-highlight').first();
	await highlight.waitFor({ state: 'visible', timeout: 30000 });
	const box = (await highlight.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await page.locator('.inkling-popup').getByRole('menuitem', { name: 'Test', exact: true }).click();

	await expect
		.poll(() => page.evaluate(() => (window as Window & { docText?: string }).docText))
		.toBe('Das ist ein Test.');
});
