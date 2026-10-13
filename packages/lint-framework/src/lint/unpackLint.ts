import type { LintKind } from './lintKindColor';
import { SuggestionKind } from './types';

export type UnpackedSpan = {
	start: number;
	end: number;
};

export type UnpackedLint = {
	span: UnpackedSpan;
	message_html: string;
	problem_text: string;
	lint_kind: LintKind;
	lint_kind_pretty: string;
	suggestions: UnpackedSuggestion[];
	context_hash: string;
	source: string;
};

export type UnpackedLintGroups = Record<string, UnpackedLint[]>;

export type UnpackedSuggestion = {
	kind: SuggestionKind;
	/// An empty string if replacement text is not applicable.
	replacement_text: string;
};

export function applySuggestion(text: string, span: UnpackedSpan, sug: UnpackedSuggestion): string {
	switch (sug.kind) {
		case SuggestionKind.Remove:
			return text.slice(0, span.start) + text.slice(span.end);
		case SuggestionKind.Replace:
			return text.slice(0, span.start) + sug.replacement_text + text.slice(span.end);
		case SuggestionKind.InsertAfter:
			return text.slice(0, span.end) + sug.replacement_text + text.slice(span.end);
	}
}
