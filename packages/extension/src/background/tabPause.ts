/**
 * Tabs where the user paused checking. One `storage.session` key per tab, so
 * concurrent updates cannot overwrite each other. The value is the time the
 * pause was set, so a late "page started" message cannot end a newer pause.
 * `storage.session` survives a service worker restart and is empty after a
 * browser restart.
 */

function pauseKey(tabId: number): string {
	return `paused:${tabId}`;
}

export async function isTabPaused(tabId: number | undefined): Promise<boolean> {
	if (tabId == null) {
		return false;
	}
	const key = pauseKey(tabId);
	return (await chrome.storage.session.get(key))[key] != null;
}

/** Returns whether the stored state changed. */
export async function setTabPaused(tabId: number, paused: boolean): Promise<boolean> {
	if ((await isTabPaused(tabId)) === paused) {
		return false;
	}
	if (paused) {
		await chrome.storage.session.set({ [pauseKey(tabId)]: Date.now() });
	} else {
		await chrome.storage.session.remove(pauseKey(tabId));
	}
	return true;
}

export async function clearTabPause(tabId: number): Promise<void> {
	await chrome.storage.session.remove(pauseKey(tabId));
}

/** A pause ends with a document that started after the pause was set. */
export function pauseEndedByStart(pausedAt: unknown, startedAt: number): boolean {
	return typeof pausedAt === 'number' && pausedAt <= startedAt;
}

/**
 * Ends the pause of a tab if it was set before the document started at `startedAt`.
 * Returns whether it ended one.
 */
export async function endTabPauseAt(tabId: number, startedAt: number): Promise<boolean> {
	const key = pauseKey(tabId);
	if (pauseEndedByStart((await chrome.storage.session.get(key))[key], startedAt)) {
		await chrome.storage.session.remove(key);
		return true;
	}
	return false;
}
