import type { LintOptions, UnpackedLintGroups } from 'lint-framework';
import { LRUCache } from 'lru-cache';
import type { ActivationKey, Hotkey, ServerSettings } from './protocol';

export default class ProtocolClient {
	private static readonly lintCache = new LRUCache<string, Promise<UnpackedLintGroups>>({
		max: 5000,
		ttl: 60_000,
		ttlAutopurge: true,
	});

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
			p = chrome.runtime
				.sendMessage({ kind: 'lint', text, domain, options })
				.then((r) => r.lints as UnpackedLintGroups);
			this.lintCache.set(key, p);
		}
		return p;
	}

	public static async getServerSettings(): Promise<ServerSettings> {
		return (await chrome.runtime.sendMessage({ kind: 'getServerSettings' })).settings;
	}

	public static async setServerSettings(settings: ServerSettings): Promise<void> {
		this.lintCache.clear();
		await chrome.runtime.sendMessage({ kind: 'setServerSettings', settings: { ...settings } });
	}

	/** Ask the server for its version. Resolves to the version, or to the error message. */
	public static async testServer(serverUrl: string): Promise<{ ok: boolean; message: string }> {
		const resp = await chrome.runtime.sendMessage({ kind: 'testServer', serverUrl });
		return { ok: resp.ok, message: resp.message };
	}

	public static async getDisabledRules(): Promise<string[]> {
		return (await chrome.runtime.sendMessage({ kind: 'getDisabledRules' })).rules;
	}

	public static async setDisabledRules(rules: string[]): Promise<void> {
		this.lintCache.clear();
		await chrome.runtime.sendMessage({ kind: 'setDisabledRules', rules: [...rules] });
	}

	public static async setRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
		this.lintCache.clear();
		await chrome.runtime.sendMessage({ kind: 'setRuleEnabled', ruleId, enabled });
	}

	public static async getDelay(): Promise<number> {
		return (await chrome.runtime.sendMessage({ kind: 'getDelay' })).delay;
	}

	public static async setDelay(delay: number): Promise<void> {
		await chrome.runtime.sendMessage({ kind: 'setDelay', delay });
	}

	public static async getDomainEnabled(domain: string): Promise<boolean> {
		this.lintCache.clear();
		return (await chrome.runtime.sendMessage({ kind: 'getDomainStatus', domain })).enabled;
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
		await chrome.runtime.sendMessage({
			kind: 'setDomainStatus',
			enabled,
			domain,
			overrideValue,
		});
	}

	public static async getDefaultEnabled(): Promise<boolean> {
		this.lintCache.clear();
		return (await chrome.runtime.sendMessage({ kind: 'getDefaultStatus' })).enabled;
	}

	public static async getEnabledDomains(): Promise<string[]> {
		return (await chrome.runtime.sendMessage({ kind: 'getEnabledDomains' })).domains;
	}

	public static async setDefaultEnabled(enabled: boolean): Promise<void> {
		await chrome.runtime.sendMessage({ kind: 'setDefaultStatus', enabled });
	}

	public static async getActivationKey(): Promise<ActivationKey> {
		return (await chrome.runtime.sendMessage({ kind: 'getActivationKey' })).key;
	}

	public static async getHotkey(): Promise<Hotkey> {
		return (await chrome.runtime.sendMessage({ kind: 'getHotkey' })).hotkey;
	}

	public static async setHotkey(hotkey: Hotkey): Promise<void> {
		const modifiers = hotkey.modifiers;
		const hotkeyCopy = {
			modifiers: [...modifiers], // Create a new array
			key: hotkey.key,
		};
		await chrome.runtime.sendMessage({ kind: 'setHotkey', hotkey: hotkeyCopy });
	}

	public static async setActivationKey(key: ActivationKey): Promise<void> {
		await chrome.runtime.sendMessage({ kind: 'setActivationKey', key });
	}

	public static async addToUserDictionary(words: string[]): Promise<void> {
		this.lintCache.clear();
		await chrome.runtime.sendMessage({ kind: 'addToUserDictionary', words });
	}

	public static async setUserDictionary(words: string[]): Promise<void> {
		this.lintCache.clear();
		await chrome.runtime.sendMessage({ kind: 'setUserDictionary', words });
	}

	public static async getUserDictionary(): Promise<string[]> {
		return (await chrome.runtime.sendMessage({ kind: 'getUserDictionary' })).words;
	}

	public static async ignoreHash(hash: string): Promise<void> {
		await chrome.runtime.sendMessage({ kind: 'ignoreLint', contextHash: hash });
		this.lintCache.clear();
	}

	public static async clearIgnoredLints(): Promise<void> {
		await chrome.runtime.sendMessage({ kind: 'clearIgnoredLints' });
		this.lintCache.clear();
	}

	public static async openOptions(): Promise<void> {
		// Use background to open options to support content scripts reliably
		await chrome.runtime.sendMessage({ kind: 'openOptions' });
	}
}
