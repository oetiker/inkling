/**
 * Which storage keys decide whether checking is on for a host. Kept free of the
 * `chrome` API so unit tests can load it.
 */

/** Hosts to look up, most specific first: `www.x` falls back to `x`. */
export function domainLookupCandidates(hostname: string): string[] {
	const withoutWww = hostname.replace(/^www\./, '');
	return withoutWww === hostname ? [hostname] : [hostname, withoutWww];
}

/**
 * The host whose key a new status must be written to, so that the next lookup
 * for `hostname` finds the written value: the first stored candidate, or the
 * exact host when none is stored.
 */
export function domainWriteTarget(hostname: string, storedHosts: ReadonlySet<string>): string {
	return domainLookupCandidates(hostname).find((c) => storedHosts.has(c)) ?? hostname;
}
