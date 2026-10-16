import type { LintKind } from './types';

export type { LintKind } from './types';

// First, define the color map as a constant
const LINT_KIND_COLORS = {
	Agreement: '#228B22', // Forest green
	BoundaryError: '#8B4513', // Saddle brown
	Capitalization: '#540D6E', // Deep purple
	Eggcorn: '#FF8C00', // Dark orange
	Enhancement: '#0EAD69', // Green
	Formatting: '#7D3C98', // Amethyst purple
	Grammar: '#F59E0B', // Amber
	Malapropism: '#C71585', // Medium violet red
	Miscellaneous: '#3BCEAC', // Turquoise
	Nonstandard: '#008B8B', // Dark cyan
	Punctuation: '#D4850F', // Dark orange
	Readability: '#2E8B57', // Sea green
	Redundancy: '#4682B4', // Steel blue
	Regionalism: '#C061CB', // Vibrant purple
	Repetition: '#00A67C', // Green-cyan
	Spelling: '#E5484D', // Red
	Style: '#3E63DD', // Indigo blue
	Typo: '#FF6B35', // Vibrant orange-red
	Usage: '#1E90FF', // Dodger blue
	WordChoice: '#228B22', // Forest green
	WordOrder: '#4D4DFF', // Royal blue
} as const satisfies Record<LintKind, string>;

// Export the array of all lint kind names
export const LINT_KINDS = Object.keys(LINT_KIND_COLORS) as LintKind[];

// The main function that uses the map
export function lintKindColor(lintKindKey: string): string {
	const color = LINT_KIND_COLORS[lintKindKey as LintKind];
	if (!color) {
		throw new Error(`Unexpected lint kind: ${lintKindKey}`);
	}
	return color;
}

/** Fill opacity per kind, so the three marker colors look equally strong. */
const FILL_ALPHA: Partial<Record<LintKind, number>> = {
	Spelling: 0.28,
	Grammar: 0.34,
	Style: 0.26,
};

/** The translucent marker fill drawn behind a lint. */
export function lintKindFill(lintKindKey: string): string {
	const hex = lintKindColor(lintKindKey);
	const alpha = FILL_ALPHA[lintKindKey as LintKind] ?? 0.28;
	return `${hex}${Math.round(alpha * 255)
		.toString(16)
		.padStart(2, '0')}`;
}
