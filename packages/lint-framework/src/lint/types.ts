/** A range of the source text, in UTF-16 code units. */
export type Span = {
	start: number;
	end: number;
};

/** What applying a suggestion does to the problem text. */
export enum SuggestionKind {
	/** Replace the problem text. */
	Replace = 0,
	/** Remove the problem text. */
	Remove = 1,
	/** Insert text after the problem text. */
	InsertAfter = 2,
}

/** The category of a lint, which selects its highlight color. */
export type LintKind =
	| 'Agreement'
	| 'BoundaryError'
	| 'Capitalization'
	| 'Eggcorn'
	| 'Enhancement'
	| 'Formatting'
	| 'Grammar'
	| 'Malapropism'
	| 'Miscellaneous'
	| 'Nonstandard'
	| 'Punctuation'
	| 'Readability'
	| 'Redundancy'
	| 'Regionalism'
	| 'Repetition'
	| 'Spelling'
	| 'Style'
	| 'Typo'
	| 'Usage'
	| 'WordChoice'
	| 'WordOrder';

/** Hints that the page gives about the text it asks to check. */
export interface LintOptions {
	/** The markup language of the text. Text without one is checked as plain text. */
	language?: 'plaintext' | 'markdown' | 'typst';
	/** Treat the whole text as headings. */
	forceAllHeadings?: boolean;
}
