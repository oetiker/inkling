/**
 * Tabs where the user paused checking. One `storage.session` key per tab, so
 * concurrent updates cannot overwrite each other. `storage.session` survives a
 * service worker restart and is empty after a browser restart.
 */

function pauseKey(tabId: number): string {
	return `paused:${tabId}`;
}

export async function isTabPaused(tabId: number | undefined): Promise<boolean> {
	if (tabId == null) {
		return false;
	}
	const key = pauseKey(tabId);
	return (await chrome.storage.session.get(key))[key] === true;
}

/** Returns whether the stored state changed. */
export async function setTabPaused(tabId: number, paused: boolean): Promise<boolean> {
	if ((await isTabPaused(tabId)) === paused) {
		return false;
	}
	if (paused) {
		await chrome.storage.session.set({ [pauseKey(tabId)]: true });
	} else {
		await chrome.storage.session.remove(pauseKey(tabId));
	}
	return true;
}

export async function clearTabPause(tabId: number): Promise<void> {
	await chrome.storage.session.remove(pauseKey(tabId));
}
