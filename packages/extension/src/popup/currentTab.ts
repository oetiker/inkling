/** The tab the popup acts on, and which hosts Inkling can check. */

export type PopupTab = { id: number; url: string | undefined };

/** Content scripts cannot run on these hosts, although they are http(s). */
const BLOCKED_HOSTS = ['chromewebstore.google.com', 'addons.mozilla.org'];

/**
 * The active tab of the current window. Tests open the popup as a normal tab
 * and pass the tab to act on as `?tab=<id>`; popup.html is not
 * web-accessible, so only the extension itself can open it with a parameter.
 */
export async function currentTab(): Promise<PopupTab | undefined> {
	const param = new URLSearchParams(location.search).get('tab');
	const tab =
		param != null
			? await chrome.tabs.get(Number(param))
			: (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
	return tab?.id == null ? undefined : { id: tab.id, url: tab.url };
}

/** The hostname to show and send, or undefined when Inkling cannot run on the page. */
export function checkableHost(url: string | undefined): string | undefined {
	if (url == null) {
		return undefined;
	}
	try {
		const { protocol, hostname, pathname } = new URL(url);
		if (protocol !== 'https:' && protocol !== 'http:') {
			return undefined;
		}
		if (BLOCKED_HOSTS.includes(hostname)) {
			return undefined;
		}
		if (hostname === 'chrome.google.com' && pathname.startsWith('/webstore')) {
			return undefined;
		}
		return hostname;
	} catch {
		return undefined;
	}
}
