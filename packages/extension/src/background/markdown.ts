/**
 * Split Markdown into the annotated text that LanguageTool's `/v2/check` takes as
 * its `data` parameter: prose as `text`, syntax as `markup`. LanguageTool reports
 * offsets in the original string, markup included, so marks need no remapping.
 *
 * This covers the Markdown people type into web forms: emphasis, headings, inline
 * and fenced code, links and images, autolinks, HTML tags, lists, blockquotes,
 * thematic breaks, tables and backslash escapes. It is not a full CommonMark parser.
 */

export type AnnotationPart = { text: string } | { markup: string; interpretAs?: string };

/** What LanguageTool reads in place of code and addresses, so a sentence keeps its shape. */
const PLACEHOLDER = 'Dummy';
const PARAGRAPH_BREAK = '\n\n';

const FENCE = /^(\s*)(`{3,}|~{3,})/;
const BLOCKQUOTE = /^ {0,3}> ?/;
const HEADING = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const HEADING_CLOSE = /[ \t]+#+[ \t]*$/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+(?:\[[ xX]\][ \t]+)?|$)/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S+/;
const TABLE_ROW = /^[ \t]*\|/;
const TABLE_DELIMITER = /^[ \t]*\|?(?:[ \t]*:?-+:?[ \t]*\|)+(?:[ \t]*:?-+:?[ \t]*)?$/;
const TABLE_PIPE = /[ \t]*(?<!\\)\|[ \t]*/g;

const INLINE_LINK =
	/^\[((?:[^[\]\\]|\\.|\[[^\]]*\])*)\](\((?:[^()\s]|\([^()]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)|\[[^\]]*\])/;
const IMAGE =
	/^!\[(?:[^[\]\\]|\\.)*\](?:\((?:[^()\s]|\([^()]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)|\[[^\]]*\])/;
const AUTOLINK = /^<(?:[a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\s]*|[^<>\s@]+@[^<>\s@]+)>/;
const HTML_TAG = /^(?:<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>)/;
const ESCAPABLE = /^\\[!-/:-@[-`{-~]/;

type LineKind = 'blank' | 'paragraph' | 'block';

class Builder {
	readonly parts: AnnotationPart[] = [];
	/** The end of what LanguageTool reads so far, to avoid stacking paragraph breaks. */
	private checkedTail = '';

	text(text: string) {
		if (text.length === 0) return;
		const last = this.parts.at(-1);
		if (last != null && 'text' in last) {
			last.text += text;
		} else {
			this.parts.push({ text });
		}
		this.checkedTail = (this.checkedTail + text).slice(-2);
	}

	markup(markup: string, interpretAs = '') {
		if (markup.length === 0) return;
		const last = this.parts.at(-1);
		if (last != null && 'markup' in last) {
			last.markup += markup;
			const joined = (last.interpretAs ?? '') + interpretAs;
			if (joined.length > 0) last.interpretAs = joined;
		} else {
			this.parts.push(interpretAs.length > 0 ? { markup, interpretAs } : { markup });
		}
		this.checkedTail = (this.checkedTail + interpretAs).slice(-2);
	}

	/** Markup that ends a paragraph, read as one paragraph break however many there are. */
	paragraphBreak(markup: string) {
		const needed = this.checkedTail.length > 0 && this.checkedTail !== PARAGRAPH_BREAK;
		this.markup(markup, needed ? PARAGRAPH_BREAK : '');
	}
}

export function markdownToAnnotation(markdown: string): AnnotationPart[] {
	const out = new Builder();
	const lines = markdown.split('\n');
	let fence: { char: string; length: number } | null = null;
	let previous: LineKind = 'blank';

	lines.forEach((line, index) => {
		if (index > 0) {
			// A line break inside a paragraph is part of the prose; any other ends a paragraph.
			const continues = previous === 'paragraph' && fence == null && continuesParagraph(line);
			if (continues) {
				out.text('\n');
			} else {
				out.paragraphBreak('\n');
			}
		}

		if (fence != null) {
			out.markup(line);
			const close = FENCE.exec(line);
			if (close != null && close[2][0] === fence.char && close[2].length >= fence.length) {
				if (line.slice(close[0].length).trim().length === 0) fence = null;
			}
			previous = 'block';
			return;
		}

		previous = convertLine(line, out, (opened) => {
			fence = opened;
		});
	});

	return out.parts;
}

/** Whether `line` goes on with the paragraph of the line before it. */
function continuesParagraph(line: string): boolean {
	let rest = line;
	for (let quote = BLOCKQUOTE.exec(rest); quote != null; quote = BLOCKQUOTE.exec(rest)) {
		rest = rest.slice(quote[0].length);
	}
	if (rest.trim().length === 0) return false;
	return ![
		FENCE,
		HEADING,
		LIST_ITEM,
		THEMATIC_BREAK,
		SETEXT_UNDERLINE,
		LINK_DEFINITION,
		TABLE_ROW,
	].some((re) => re.test(rest));
}

function convertLine(
	line: string,
	out: Builder,
	openFence: (fence: { char: string; length: number }) => void,
): LineKind {
	let rest = line;
	for (let quote = BLOCKQUOTE.exec(rest); quote != null; quote = BLOCKQUOTE.exec(rest)) {
		out.markup(quote[0]);
		rest = rest.slice(quote[0].length);
	}

	if (rest.trim().length === 0) {
		out.markup(rest);
		return 'blank';
	}

	const fence = FENCE.exec(rest);
	if (fence != null) {
		out.markup(rest);
		openFence({ char: fence[2][0], length: fence[2].length });
		return 'block';
	}

	if (
		THEMATIC_BREAK.test(rest) ||
		SETEXT_UNDERLINE.test(rest) ||
		LINK_DEFINITION.test(rest) ||
		TABLE_DELIMITER.test(rest)
	) {
		out.markup(rest);
		return 'block';
	}

	if (TABLE_ROW.test(rest)) {
		let last = 0;
		for (const pipe of rest.matchAll(TABLE_PIPE)) {
			inline(rest.slice(last, pipe.index), out);
			out.paragraphBreak(pipe[0]);
			last = pipe.index + pipe[0].length;
		}
		inline(rest.slice(last), out);
		return 'block';
	}

	const heading = HEADING.exec(rest);
	if (heading != null) {
		out.markup(heading[0]);
		rest = rest.slice(heading[0].length);
		const close = HEADING_CLOSE.exec(rest);
		inline(close == null ? rest : rest.slice(0, close.index), out);
		if (close != null) out.markup(close[0]);
		return 'block';
	}

	const item = LIST_ITEM.exec(rest);
	if (item != null) {
		out.markup(item[0]);
		rest = rest.slice(item[0].length);
	} else {
		const indent = /^[ \t]*/.exec(rest)![0];
		out.markup(indent);
		rest = rest.slice(indent.length);
	}
	inline(rest, out);
	return 'paragraph';
}

/** Convert the inline Markdown of one line. */
function inline(source: string, out: Builder) {
	let pending = '';
	const flush = () => {
		out.text(pending);
		pending = '';
	};
	let i = 0;
	while (i < source.length) {
		const rest = source.slice(i);
		const char = source[i];

		if (char === '\\') {
			const escaped = ESCAPABLE.exec(rest);
			if (escaped != null) {
				flush();
				out.markup('\\');
				pending += escaped[0][1];
				i += 2;
				continue;
			}
		}

		if (char === '`') {
			const ticks = /^`+/.exec(rest)![0];
			const end = rest.indexOf(ticks, ticks.length);
			if (end !== -1 && rest[end + ticks.length] !== '`') {
				flush();
				out.markup(rest.slice(0, end + ticks.length), PLACEHOLDER);
				i += end + ticks.length;
				continue;
			}
			pending += ticks;
			i += ticks.length;
			continue;
		}

		if (char === '!' || char === '<') {
			const match = (char === '!' ? IMAGE : AUTOLINK).exec(rest);
			if (match != null) {
				flush();
				out.markup(match[0], PLACEHOLDER);
				i += match[0].length;
				continue;
			}
			const tag = char === '<' ? HTML_TAG.exec(rest) : null;
			if (tag != null) {
				flush();
				out.markup(tag[0]);
				i += tag[0].length;
				continue;
			}
		}

		if (char === '[') {
			const link = INLINE_LINK.exec(rest);
			if (link != null) {
				flush();
				out.markup('[');
				inline(link[1], out);
				out.markup(`]${link[2]}`);
				i += link[0].length;
				continue;
			}
		}

		if (char === '*' || char === '_' || char === '~') {
			const run = (char === '~' ? /^~~/ : char === '*' ? /^\*+/ : /^_+/).exec(rest);
			if (run != null && isEmphasisDelimiter(source, i, run[0].length, char)) {
				flush();
				out.markup(run[0]);
				i += run[0].length;
				continue;
			}
		}

		pending += char;
		i += 1;
	}
	flush();
}

/** CommonMark's flanking rules, simplified: does this run open or close emphasis? */
function isEmphasisDelimiter(source: string, start: number, length: number, char: string) {
	const before = start > 0 ? source[start - 1] : ' ';
	const after = start + length < source.length ? source[start + length] : ' ';
	const opens = !/\s/.test(after);
	const closes = !/\s/.test(before);
	if (char === '_') {
		// Underscores inside a word, as in snake_case, are not emphasis.
		const word = /[\p{L}\p{N}]/u;
		return (opens && !word.test(before)) || (closes && !word.test(after));
	}
	return opens || closes;
}
