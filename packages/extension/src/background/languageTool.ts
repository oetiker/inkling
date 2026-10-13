import {
	type LintKind,
	SuggestionKind,
	type UnpackedLint,
	type UnpackedLintGroups,
} from 'lint-framework';

/** The most suggestions shown for one LanguageTool match. */
const MAX_SUGGESTIONS = 5;

/** Give up on a LanguageTool request after this many milliseconds. */
const REQUEST_TIMEOUT_MS = 10_000;

export type LanguageToolCheckOptions = {
	serverUrl: string;
	/** Comma-separated variants, such as `de-CH,en-US`, used when the language is detected automatically. */
	preferredVariants: string;
	disabledRules: string[];
};

export type LanguageToolResult = {
	/** The language code the server detected, such as `de-CH`. */
	language: string;
	lints: UnpackedLintGroups;
};

/** The parts of a LanguageTool `/v2/check` response that we use. */
type LanguageToolMatch = {
	message: string;
	offset: number;
	length: number;
	replacements: { value: string }[];
	context?: { text: string };
	rule: {
		id: string;
		issueType?: string;
		category: { id: string; name: string };
	};
};

type LanguageToolResponse = {
	software?: { name: string; version: string };
	language: { code: string; detectedLanguage?: { code: string } };
	matches: LanguageToolMatch[];
};

/** Check `text` with a LanguageTool server and convert the matches into Harper's lint format. */
export async function checkWithLanguageTool(
	text: string,
	options: LanguageToolCheckOptions,
): Promise<LanguageToolResult> {
	const body = new URLSearchParams({ text, language: 'auto' });
	const variants = options.preferredVariants.trim();
	if (variants.length > 0) {
		body.set('preferredVariants', variants);
	}
	if (options.disabledRules.length > 0) {
		body.set('disabledRules', options.disabledRules.join(','));
	}

	const response = await fetch(checkEndpoint(options.serverUrl), {
		method: 'POST',
		body,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`LanguageTool server answered ${response.status} ${response.statusText}`);
	}

	const json = (await response.json()) as LanguageToolResponse;
	return {
		language: json.language.detectedLanguage?.code ?? json.language.code,
		lints: matchesToLintGroups(text, json.matches),
	};
}

/** Check a short text to find out whether the server answers. Resolves to its name and version. */
export async function fetchServerVersion(serverUrl: string): Promise<string> {
	const response = await fetch(checkEndpoint(serverUrl), {
		method: 'POST',
		body: new URLSearchParams({ text: 'Test', language: 'en-US' }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`LanguageTool server answered ${response.status} ${response.statusText}`);
	}

	const json = (await response.json()) as LanguageToolResponse;
	return json.software ? `${json.software.name} ${json.software.version}` : 'unknown version';
}

/** Build the `/v2/check` URL from a server URL with or without the `/v2` path. */
export function checkEndpoint(serverUrl: string): string {
	const base = serverUrl.trim().replace(/\/+$/, '').replace(/\/v2$/, '');
	return `${base}/v2/check`;
}

/**
 * Convert LanguageTool matches into lint groups keyed by rule name.
 *
 * LanguageTool reports offsets in UTF-16 code units, which is also how the
 * lint framework indexes the source text, so offsets are used as they are.
 */
export function matchesToLintGroups(
	text: string,
	matches: LanguageToolMatch[],
): UnpackedLintGroups {
	const groups: UnpackedLintGroups = {};

	for (const match of matches) {
		const lintKind = lintKindForMatch(match);
		const lint: UnpackedLint = {
			span: { start: match.offset, end: match.offset + match.length },
			message_html: escapeHtml(match.message),
			problem_text: text.slice(match.offset, match.offset + match.length),
			lint_kind: lintKind,
			lint_kind_pretty: match.rule.category.name,
			suggestions: match.replacements.slice(0, MAX_SUGGESTIONS).map((replacement) => ({
				kind: replacement.value.length === 0 ? SuggestionKind.Remove : SuggestionKind.Replace,
				replacement_text: replacement.value,
			})),
			context_hash: contextHash(match.rule.id, match.context?.text ?? text),
			source: text,
		};

		groups[match.rule.id] ??= [];
		groups[match.rule.id].push(lint);
	}

	return groups;
}

const STYLE_ISSUE_TYPES = new Set(['style', 'register', 'locale-violation']);
const SPELLING_CATEGORIES = new Set(['TYPOS', 'MULTITOKEN_SPELLING']);
// English reports confused words as misspellings, German and French do not.
// They are real words in the wrong place, so they count as grammar everywhere.
const CONFUSION_CATEGORIES = new Set(['CONFUSED_WORDS', 'NONSTANDARD_PHRASES']);
// Most rules in these categories also carry the issue type `style`; the list
// catches the few that set none.
const STYLE_CATEGORIES = new Set([
	'STYLE',
	'REDUNDANCY',
	'REPETITIONS_STYLE',
	'COLLOQUIALISMS',
	'PLAIN_ENGLISH',
	'GENDER_NEUTRALITY',
	'REGIONALISMS',
	'CREATIVE_WRITING',
	'TEXT_ANALYSIS',
	'TON_ACADEMIC',
	'WIKIPEDIA',
]);

/**
 * Sort a match into one of three lint kinds, which set the highlight color:
 * Spelling (red), Style (blue) or Grammar (amber) for everything else. Most
 * German and French rules report the issue type `uncategorized` and a
 * language-specific category, so unknown categories fall back to Grammar.
 */
function lintKindForMatch(match: LanguageToolMatch): LintKind {
	const { issueType, category } = match.rule;
	if (CONFUSION_CATEGORIES.has(category.id)) {
		return 'Grammar';
	}
	if (
		issueType === 'misspelling' ||
		issueType === 'duplication' ||
		SPELLING_CATEGORIES.has(category.id)
	) {
		return 'Spelling';
	}
	if ((issueType && STYLE_ISSUE_TYPES.has(issueType)) || STYLE_CATEGORIES.has(category.id)) {
		return 'Style';
	}
	return 'Grammar';
}

/**
 * A stable 64-bit FNV-1a hash of the rule and the text around the match, as a
 * decimal string, so that "ignore" survives edits elsewhere in the text.
 */
function contextHash(ruleId: string, context: string): string {
	let hash = 0xcbf29ce484222325n;
	for (const char of `${ruleId}\u0000${context}`) {
		hash ^= BigInt(char.codePointAt(0) ?? 0);
		hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
	}
	return hash.toString();
}

function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
