import type { LintOptions, UnpackedLintGroups } from 'lint-framework';
import { LRUCache } from 'lru-cache';
import { type ActivationKey, type Hotkey, type ServerSettings, unwrapResponse } from './protocol';

export default class ProtocolClient {
	private static readonly lintCache = new LRUCache<string, Promise<UnpackedLintGroups>>({
		max: 5000,
		ttl: 60_000,
		ttlAutopurge: true,
	});

	/** Sends a message to the background; rejects when the background answers with an error. */
	private static async send(message: unknown): Promise<any> {
		return unwrapResponse(await chrome.runtime.sendMessage(message));
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

	public static async getDomainEnabled(domain: string): Promise<boolean> {
		this.lintCache.clear();
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
		this.lintCache.clear();
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
