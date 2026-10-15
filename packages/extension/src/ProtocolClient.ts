import type { LintOptions, UnpackedLintGroups } from 'lint-framework';
import { LRUCache } from 'lru-cache';
import { type ActivationKey, type Hotkey, type ServerSettings, unwrapResponse } from './protocol';

export default class ProtocolClient {
	private static readonly lintCache = new LRUCache<string, Promise<UnpackedLintGroups>>({
		max: 5000,
		ttl: 60_000,
		ttlAutopurge: true,
	});

	private static contextLostHandler: (() => void) | null = null;
	private static contextLost = false;

	/**
	 * Call `handler` once the extension that runs this script was reloaded, updated or
	 * turned off. Its background is gone for good then, and no request is answered again.
	 */
	public static onContextLost(handler: () => void): void {
		this.contextLostHandler = handler;
	}

	/** Whether the extension context is gone. Tells the handler the first time it is. */
	private static checkContextLost(): boolean {
		if (this.contextLost) {
			return true;
		}
		// An orphaned content script keeps chrome.runtime, but its id is gone.
		if (globalThis.chrome?.runtime?.id != null) {
			return false;
		}
		this.contextLost = true;
		this.lintCache.clear();
		this.contextLostHandler?.();
		return true;
	}

	/**
	 * Sends a message to the background; rejects when the background answers with an error.
	 * Once the extension context is lost, it never settles: every caller is shutting down,
	 * and a rejection would only log an error per request.
	 */
	private static async send(message: unknown): Promise<any> {
		if (this.checkContextLost()) {
			return new Promise(() => {});
		}
		try {
			return unwrapResponse(await chrome.runtime.sendMessage(message));
		} catch (error) {
			if (this.checkContextLost()) {
				return new Promise(() => {});
			}
			throw error;
		}
	}

	private static cacheKey(text: string, domain: string, options?: LintOptions): string {
		return JSON.stringify([
			domain,
			text,
			options?.language ?? 'markdown',
			options?.forceAllHeadings ?? false,
		]);
	}

	public static async lint(
		text: string,
		domain: string,
		options?: LintOptions,
	): Promise<UnpackedLintGroups> {
		// A cached answer would hide that the extension is gone; the keepalive relies on this.
		if (this.checkContextLost()) {
			return new Promise(() => {});
		}
		const key = this.cacheKey(text, domain, options);
		let p = this.lintCache.get(key);
		if (!p) {
			p = ProtocolClient.send({ kind: 'lint', text, domain, options }).then(
				(r) => r.lints as UnpackedLintGroups,
			);
			// Do not keep a failed check in the cache.
			p.catch(() => this.lintCache.delete(key));
			this.lintCache.set(key, p);
		}
		return p;
	}

	/** Forget cached results, so the next check asks the background again. */
	public static clearCache(): void {
		this.lintCache.clear();
	}

	public static async getServerSettings(): Promise<ServerSettings> {
		return (await ProtocolClient.send({ kind: 'getServerSettings' })).settings;
	}

	public static async setServerSettings(settings: ServerSettings): Promise<void> {
		this.lintCache.clear();
		await ProtocolClient.send({ kind: 'setServerSettings', settings: { ...settings } });
	}

	/** Ask the server for its version. Resolves to the version, or to the error message. */
	public static async testServer(serverUrl: string): Promise<{ ok: boolean; message: string }> {
		const resp = await ProtocolClient.send({ kind: 'testServer', serverUrl });
		return { ok: resp.ok, message: resp.message };
	}

	public static async getDisabledRules(): Promise<string[]> {
		return (await ProtocolClient.send({ kind: 'getDisabledRules' })).rules;
	}

	public static async setDisabledRules(rules: string[]): Promise<void> {
		this.lintCache.clear();
		await ProtocolClient.send({ kind: 'setDisabledRules', rules: [...rules] });
	}

	public static async setRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
		this.lintCache.clear();
		await ProtocolClient.send({ kind: 'setRuleEnabled', ruleId, enabled });
	}

	public static async getDelay(): Promise<number> {
		return (await ProtocolClient.send({ kind: 'getDelay' })).delay;
	}

	public static async setDelay(delay: number): Promise<void> {
		await ProtocolClient.send({ kind: 'setDelay', delay });
	}

	/** Whether text from `domain` in this tab gets checked now: site, default and pause. */
	public static async isActive(domain: string): Promise<boolean> {
		return (await ProtocolClient.send({ kind: 'getActive', domain })).active;
	}

	public static async getDomainEnabled(domain: string): Promise<boolean> {
		return (await ProtocolClient.send({ kind: 'getDomainStatus', domain })).enabled;
	}

	/** Set whether checking is enabled for a given domain.
	 *
	 * @param overrideValue dictates whether this should override a previous setting.
	 * */
	public static async setDomainEnabled(
		domain: string,
		enabled: boolean,
		overrideValue = true,
	): Promise<void> {
		await ProtocolClient.send({
			kind: 'setDomainStatus',
			enabled,
			domain,
			overrideValue,
		});
	}

	public static async getDefaultEnabled(): Promise<boolean> {
		return (await ProtocolClient.send({ kind: 'getDefaultStatus' })).enabled;
	}

	public static async getEnabledDomains(): Promise<string[]> {
		return (await ProtocolClient.send({ kind: 'getEnabledDomains' })).domains;
	}

	public static async setDefaultEnabled(enabled: boolean): Promise<void> {
		await ProtocolClient.send({ kind: 'setDefaultStatus', enabled });
	}

	public static async getTabPaused(tabId: number): Promise<boolean> {
		return (await ProtocolClient.send({ kind: 'getTabPaused', tabId })).paused;
	}

	public static async setTabPaused(tabId: number, paused: boolean): Promise<void> {
		await ProtocolClient.send({ kind: 'setTabPaused', tabId, paused });
	}

	public static async pageStarted(startedAt: number): Promise<void> {
		await ProtocolClient.send({ kind: 'pageStarted', startedAt });
	}

	public static async getActivationKey(): Promise<ActivationKey> {
		return (await ProtocolClient.send({ kind: 'getActivationKey' })).key;
	}

	public static async getHotkey(): Promise<Hotkey> {
		return (await ProtocolClient.send({ kind: 'getHotkey' })).hotkey;
	}

	public static async setHotkey(hotkey: Hotkey): Promise<void> {
		const modifiers = hotkey.modifiers;
		const hotkeyCopy = {
			modifiers: [...modifiers], // Create a new array
			key: hotkey.key,
		};
		await ProtocolClient.send({ kind: 'setHotkey', hotkey: hotkeyCopy });
	}

	public static async setActivationKey(key: ActivationKey): Promise<void> {
		await ProtocolClient.send({ kind: 'setActivationKey', key });
	}

	public static async addToUserDictionary(words: string[]): Promise<void> {
		this.lintCache.clear();
		await ProtocolClient.send({ kind: 'addToUserDictionary', words });
	}

	public static async setUserDictionary(words: string[]): Promise<void> {
		this.lintCache.clear();
		await ProtocolClient.send({ kind: 'setUserDictionary', words });
	}

	public static async getUserDictionary(): Promise<string[]> {
		return (await ProtocolClient.send({ kind: 'getUserDictionary' })).words;
	}

	public static async ignoreHash(hash: string): Promise<void> {
		await ProtocolClient.send({ kind: 'ignoreLint', contextHash: hash });
		this.lintCache.clear();
	}

	public static async clearIgnoredLints(): Promise<void> {
		await ProtocolClient.send({ kind: 'clearIgnoredLints' });
		this.lintCache.clear();
	}

	public static async openOptions(): Promise<void> {
		// Use background to open options to support content scripts reliably
		await ProtocolClient.send({ kind: 'openOptions' });
	}
}
