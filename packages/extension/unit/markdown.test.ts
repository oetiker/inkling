import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type AnnotationPart, markdownToAnnotation } from '../src/background/markdown.ts';

/** The text LanguageTool checks: prose as it is, markup as its interpretation. */
function checked(parts: AnnotationPart[]): string {
	return parts.map((p) => ('text' in p ? p.text : (p.interpretAs ?? ''))).join('');
}

/** The original string, which LanguageTool's offsets count in. */
function original(parts: AnnotationPart[]): string {
	return parts.map((p) => ('text' in p ? p.text : p.markup)).join('');
}

function convert(md: string): AnnotationPart[] {
	const parts = markdownToAnnotation(md);
	assert.equal(original(parts), md, 'the parts must add up to the original text');
	return parts;
}

describe('markdownToAnnotation', () => {
	it('sends plain prose as one text part', () => {
		assert.deepEqual(convert('Ein Satz ohne Markup.'), [{ text: 'Ein Satz ohne Markup.' }]);
	});

	it('returns nothing for an empty text', () => {
		assert.deepEqual(convert(''), []);
	});

	it('hides emphasis and strikethrough markers', () => {
		const parts = convert('Das ist **fett**, *kursiv*, __auch__, _so_ und ~~weg~~.');
		assert.equal(checked(parts), 'Das ist fett, kursiv, auch, so und weg.');
		assert.deepEqual(parts.slice(0, 3), [{ text: 'Das ist ' }, { markup: '**' }, { text: 'fett' }]);
	});

	it('keeps stars and underscores that are not emphasis', () => {
		assert.equal(
			checked(convert('2 * 3 = 6 und snake_case_name')),
			'2 * 3 = 6 und snake_case_name',
		);
	});

	it('turns headings into paragraphs without the hash marks', () => {
		const parts = convert('# Titel\nErster Absatz.\n\n## Teil ##\nMehr.');
		assert.equal(checked(parts), 'Titel\n\nErster Absatz.\n\nTeil\n\nMehr.');
	});

	it('turns a blank line into one paragraph break and keeps single line breaks', () => {
		const parts = convert('Zeile eins\nZeile zwei\n\n\nNeuer Absatz.');
		assert.equal(checked(parts), 'Zeile eins\nZeile zwei\n\nNeuer Absatz.');
		assert.ok(parts.some((p) => 'markup' in p && p.interpretAs === '\n\n'));
	});

	it('replaces inline code with a placeholder word', () => {
		const parts = convert('Rufe `npm install` auf.');
		assert.equal(checked(parts), 'Rufe Dummy auf.');
		assert.deepEqual(parts[1], { markup: '`npm install`', interpretAs: 'Dummy' });
	});

	it('hides fenced code blocks', () => {
		const md = 'Vorher.\n\n```js\nconst tset = 1;\n```\nNachher.';
		assert.equal(checked(convert(md)), 'Vorher.\n\nNachher.');
	});

	it('hides a code block that is not closed until the end', () => {
		assert.equal(checked(convert('Text.\n~~~\ncode\nmore')), 'Text.\n\n');
	});

	it('checks the text of a link but not its address', () => {
		const parts = convert('Siehe [die Anleitung](https://example.com/a_b "Titel") hier.');
		assert.equal(checked(parts), 'Siehe die Anleitung hier.');
		assert.ok(
			parts.some((p) => 'markup' in p && p.markup === '](https://example.com/a_b "Titel")'),
		);
	});

	it('checks emphasis inside link text and reference links', () => {
		assert.equal(checked(convert('Ein [**fetter** Link][ref].')), 'Ein fetter Link.');
	});

	it('hides images, autolinks and HTML tags', () => {
		const parts = convert('Bild ![Alt](bild.png) und <https://x.ch> mit <b>Tag</b>.');
		assert.equal(checked(parts), 'Bild Dummy und Dummy mit Tag.');
	});

	it('hides link reference definitions', () => {
		assert.equal(checked(convert('Text.\n\n[ref]: https://example.com')), 'Text.\n\n');
	});

	it('hides list markers and makes every item a paragraph', () => {
		const md = '- erstens\n* zweitens\n  1. drei\n2) vier\n- [x] erledigt';
		assert.equal(checked(convert(md)), 'erstens\n\nzweitens\n\ndrei\n\nvier\n\nerledigt');
	});

	it('hides blockquote markers but keeps the lines of a quote together', () => {
		assert.equal(
			checked(convert('> Ein Zitat\n> geht weiter.\n>\n> > Tiefer.')),
			'Ein Zitat\ngeht weiter.\n\nTiefer.',
		);
	});

	it('hides thematic breaks and setext underlines', () => {
		assert.equal(
			checked(convert('Titel\n=====\nText.\n\n---\n\nMehr.')),
			'Titel\n\nText.\n\nMehr.',
		);
	});

	it('keeps an escaped character but hides the backslash', () => {
		assert.equal(checked(convert('Kein \\*Stern\\* hier.')), 'Kein *Stern* hier.');
	});

	it('turns table cells into paragraphs and hides the delimiter row', () => {
		const md = '| Name | Wert |\n| --- | :-: |\n| Tset | 1 |';
		assert.equal(checked(convert(md)).replace(/\s+/g, ' ').trim(), 'Name Wert Tset 1');
	});

	it('keeps the offset of a word, counted in the original text', () => {
		const md = '## **Ein** [Tset](https://x.ch)';
		const parts = convert(md);
		let offset = 0;
		let found = -1;
		for (const part of parts) {
			if ('text' in part && part.text.includes('Tset')) {
				found = offset + part.text.indexOf('Tset');
			}
			offset += 'text' in part ? part.text.length : part.markup.length;
		}
		assert.equal(found, md.indexOf('Tset'));
	});
});
