/**
 * The time a page load counts from, in ms since the epoch. A prerendered page
 * that was activated before this script ran counts from its activation, not
 * from the prerender start, so an older pause cannot survive the activation.
 */
export function pageStartTime(now: number, elapsed: number, activationStart: number): number {
	return now - elapsed + activationStart;
}
