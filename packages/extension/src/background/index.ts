import type { UnpackedLintGroups } from 'lint-framework';
import {
	ActivationKey,
	type AddToUserDictionaryRequest,
	createErrorResponse,
	createUnitResponse,
	type GetActivationKeyResponse,
	type GetDefaultStatusResponse,
	type GetDelayResponse,
	type GetDisabledRulesResponse,
	type GetDomainStatusRequest,
	type GetDomainStatusResponse,
	type GetEnabledDomainsResponse,
	type GetHotkeyResponse,
	type GetServerSettingsResponse,
	type GetTabPausedRequest,
	type GetTabPausedResponse,
	type GetUserDictionaryResponse,
	type Hotkey,
	type IgnoreLintRequest,
	type LintRequest,
	type LintResponse,
	type PageStartedRequest,
	type RefreshMessage,
	type Request,
	type Response,
	type ServerSettings,
	type SetActivationKeyRequest,
	type SetDefaultStatusRequest,
	type SetDelayRequest,
	type SetDisabledRulesRequest,
	type SetDomainStatusRequest,
	type SetHotkeyRequest,
	type SetRuleEnabledRequest,
	type SetServerSettingsRequest,
	type SetTabPausedRequest,
	type SetUserDictionaryRequest,
	type TestServerRequest,
	type TestServerResponse,
	type UnitResponse,
} from '../protocol';
import { domainLookupCandidates, domainWriteTarget } from './domainKeys';
import { checkWithLanguageTool, fetchServerVersion } from './languageTool';
import { clearTabPause, endTabPauseAt, isTabPaused, setTabPaused } from './tabPause';

/** Wait this long after typing stops before checking, unless the user picks another delay. */
const DEFAULT_DELAY_MS = 500;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// Answer a failure too, otherwise the caller waits forever.
	Promise.resolve()
		.then(() => handleRequest(request, sender))
		.catch(createErrorResponse)
		.then(sendResponse);

	return true;
});

// Without a server nothing gets checked, so a new user lands on the settings first.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
	if (reason !== 'install') {
		return;
	}
	const { serverUrl } = await getServerSettings();
	if (serverUrl.trim().length === 0) {
		chrome.runtime.openOptionsPage();
	}
});

chrome.tabs.onRemoved.addListener((tabId) => {
	void clearTabPause(tabId);
});

const defaultEnabledDomains = [
	'old.reddit.com',
	'sh.reddit.com',
	'www.reddit.com',
	'chatgpt.com',
	'www.perplexity.ai',
	'textarea.online',
	'webmail.porkbun.com',
	'mail.google.com',
	'trix-editor.org',
	'github.com',
	'linear.app',
	'messages.google.com',
	'blank.page',
	'blankpage.im',
	'froala.com',
	'playground.lexical.dev',
	'discord.com',
	'www.youtube.com',
	'www.instagram.com',
	'web.whatsapp.com',
	'outlook.live.com',
	'www.linkedin.com',
	'bsky.app',
	'pootlewriter.com',
	'www.tumblr.com',
	'dayone.me',
	'medium.com',
	'x.com',
	'www.notion.so',
	'hashnode.com',
	'www.slatejs.org',
	'localhost',
	'prosemirror.net',
	'draftjs.org',
	'gitlab.com',
	'core.trac.wordpress.org',
	'write.ellipsus.com',
	'www.facebook.com',
	'www.upwork.com',
	'news.ycombinator.com',
	'classroom.google.com',
	'quilljs.com',
	'www.wattpad.com',
	'ckeditor.com',
	'app.slack.com',
	'openrouter.ai',
	'claude.ai',
	'docs.google.com',
	'typst.app',
	'steamcommunity.com',
	'store.steampowered.com',
	'steampowered.com',
	'help.steampowered.com',
] as const;
const defaultEnabledDomainSet = new Set<string>(defaultEnabledDomains);

async function enableDefaultDomains() {
	for (const item of defaultEnabledDomains) {
		if (!(await isDomainSet(item))) {
			await setDomainEnable(item, true);
		}
	}
}

enableDefaultDomains();

function handleRequest(message: Request, sender?: chrome.runtime.MessageSender): Promise<Response> {
	switch (message.kind) {
		case 'lint':
			return handleLint(message, sender);
		case 'getServerSettings':
			return handleGetServerSettings();
		case 'setServerSettings':
			return handleSetServerSettings(message);
		case 'testServer':
			return handleTestServer(message);
		case 'getDisabledRules':
			return handleGetDisabledRules();
		case 'setDisabledRules':
			return handleSetDisabledRules(message);
		case 'setRuleEnabled':
			return handleSetRuleEnabled(message);
		case 'getDelay':
			return handleGetDelay();
		case 'setDelay':
			return handleSetDelay(message);
		case 'getDomainStatus':
			return handleGetDomainStatus(message);
		case 'setDomainStatus':
			return handleSetDomainStatus(message);
		case 'setDefaultStatus':
			return handleSetDefaultStatus(message);
		case 'getDefaultStatus':
			return handleGetDefaultStatus();
		case 'getEnabledDomains':
			return handleGetEnabledDomains();
		case 'addToUserDictionary':
			return handleAddToUserDictionary(message);
		case 'setUserDictionary':
			return handleSetUserDictionary(message);
		case 'getUserDictionary':
			return handleGetUserDictionary();
		case 'ignoreLint':
			return handleIgnoreLint(message);
		case 'clearIgnoredLints':
			return handleClearIgnoredLints();
		case 'getActivationKey':
			return handleGetActivationKey();
		case 'setActivationKey':
			return handleSetActivationKey(message);
		case 'getHotkey':
			return handleGetHotkey();
		case 'setHotkey':
			return handleSetHotkey(message);
		case 'getTabPaused':
			return handleGetTabPaused(message);
		case 'setTabPaused':
			return handleSetTabPaused(message);
		case 'pageStarted':
			return handlePageStarted(message, sender);
		case 'openOptions':
			chrome.runtime.openOptionsPage();
			return Promise.resolve(createUnitResponse());
	}
}

async function handleGetTabPaused(req: GetTabPausedRequest): Promise<GetTabPausedResponse> {
	return { kind: 'getTabPaused', paused: await isTabPaused(req.tabId) };
}

async function handleSetTabPaused(req: SetTabPausedRequest): Promise<UnitResponse> {
	if (await setTabPaused(req.tabId, req.paused)) {
		await refreshTabs([req.tabId]);
	}
	return createUnitResponse();
}

/** A new document in a tab ends its pause; History-API navigation does not get here. */
async function handlePageStarted(
	req: PageStartedRequest,
	sender?: chrome.runtime.MessageSender,
): Promise<UnitResponse> {
	if (sender?.tab?.id != null && sender.frameId === 0) {
		await endTabPauseAt(sender.tab.id, req.startedAt);
	}
	return createUnitResponse();
}

/** Handle a request for linting. */
async function handleLint(
	req: LintRequest,
	sender?: chrome.runtime.MessageSender,
): Promise<LintResponse> {
	// Keep the content-script keepalive ping cheap; empty requests must not reach the server.
	if (req.text.trim().length === 0) {
		return { kind: 'lints', lints: {} };
	}

	if (!(await shouldLintForRequest(req, sender))) {
		return { kind: 'lints', lints: {} };
	}

	const settings = await getServerSettings();
	if (settings.serverUrl.trim().length === 0) {
		return { kind: 'lints', lints: {} };
	}

	try {
		const result = await checkWithLanguageTool(req.text, {
			serverUrl: settings.serverUrl,
			preferredVariants: settings.preferredVariants,
			disabledRules: await getDisabledRules(),
		});
		return { kind: 'lints', lints: await removeDismissedLints(result.lints) };
	} catch (error) {
		console.error('LanguageTool check failed', error);
		return { kind: 'lints', lints: {} };
	}
}

/** Drop lints the user ignored and spelling lints for words in the user dictionary. */
async function removeDismissedLints(groups: UnpackedLintGroups): Promise<UnpackedLintGroups> {
	const ignored = new Set(await getIgnoredLints());
	const dictionary = new Set(await getUserDictionary());

	const filtered: UnpackedLintGroups = {};
	for (const [rule, lints] of Object.entries(groups)) {
		const kept = lints.filter(
			(lint) =>
				!ignored.has(lint.context_hash) &&
				!(lint.lint_kind === 'Spelling' && dictionary.has(lint.problem_text)),
		);
		if (kept.length > 0) {
			filtered[rule] = kept;
		}
	}
	return filtered;
}

async function shouldLintForRequest(
	req: LintRequest,
	sender?: chrome.runtime.MessageSender,
): Promise<boolean> {
	if (await isTabPaused(sender?.tab?.id)) {
		return false;
	}

	if (await enabledForDomain(req.domain)) {
		return true;
	}

	if (await isDomainSet(req.domain)) {
		return false;
	}

	const parentDomain = getParentDomain(sender);
	if (parentDomain == null || parentDomain === req.domain) {
		return false;
	}

	return await enabledForDomain(parentDomain);
}

function getParentDomain(sender?: chrome.runtime.MessageSender): string | null {
	const url = sender?.tab?.url;
	if (url == null) {
		return null;
	}

	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

async function handleGetServerSettings(): Promise<GetServerSettingsResponse> {
	return { kind: 'getServerSettings', settings: await getServerSettings() };
}

async function handleSetServerSettings(req: SetServerSettingsRequest): Promise<UnitResponse> {
	await chrome.storage.local.set({
		serverSettings: {
			serverUrl: req.settings.serverUrl.trim(),
			preferredVariants: req.settings.preferredVariants.trim(),
		},
	});
	return createUnitResponse();
}

async function handleTestServer(req: TestServerRequest): Promise<TestServerResponse> {
	try {
		const version = await fetchServerVersion(req.serverUrl);
		return { kind: 'testServer', ok: true, message: version };
	} catch (error) {
		return { kind: 'testServer', ok: false, message: String(error) };
	}
}

async function handleGetDisabledRules(): Promise<GetDisabledRulesResponse> {
	return { kind: 'getDisabledRules', rules: await getDisabledRules() };
}

async function handleSetDisabledRules(req: SetDisabledRulesRequest): Promise<UnitResponse> {
	await setDisabledRules(req.rules);
	return createUnitResponse();
}

async function handleSetRuleEnabled(req: SetRuleEnabledRequest): Promise<UnitResponse> {
	const rules = new Set(await getDisabledRules());
	if (req.enabled) {
		rules.delete(req.ruleId);
	} else {
		rules.add(req.ruleId);
	}
	await setDisabledRules([...rules]);
	return createUnitResponse();
}

async function handleGetDelay(): Promise<GetDelayResponse> {
	return { kind: 'getDelay', delay: await getDelay() };
}

async function handleSetDelay(req: SetDelayRequest): Promise<UnitResponse> {
	const delay = Number.isFinite(req.delay) ? Math.max(0, Math.trunc(req.delay)) : 0;
	await chrome.storage.local.set({ delay });
	return createUnitResponse();
}

async function handleIgnoreLint(req: IgnoreLintRequest): Promise<UnitResponse> {
	const ignored = new Set(await getIgnoredLints());
	ignored.add(req.contextHash);
	await chrome.storage.local.set({ ignoredLints: [...ignored] });
	return createUnitResponse();
}

async function handleClearIgnoredLints(): Promise<UnitResponse> {
	await chrome.storage.local.set({ ignoredLints: [] });
	return createUnitResponse();
}

async function handleGetDefaultStatus(): Promise<GetDefaultStatusResponse> {
	return {
		kind: 'getDefaultStatus',
		enabled: await enabledByDefault(),
	};
}

async function handleGetEnabledDomains(): Promise<GetEnabledDomainsResponse> {
	const all = await chrome.storage.local.get(null);
	const prefix = formatDomainKey(''); // yields 'domainStatus '
	const domains = Object.entries(all)
		.filter(([k, v]) => typeof v === 'boolean' && v === true && k.startsWith(prefix))
		.map(([k]) => k.substring(prefix.length))
		.sort((a, b) => a.localeCompare(b));

	return { kind: 'getEnabledDomains', domains };
}

async function handleGetDomainStatus(
	req: GetDomainStatusRequest,
): Promise<GetDomainStatusResponse> {
	return {
		kind: 'getDomainStatus',
		domain: req.domain,
		enabled: await enabledForDomain(req.domain),
	};
}

async function handleSetDomainStatus(req: SetDomainStatusRequest): Promise<UnitResponse> {
	if (await setDomainEnable(req.domain, req.enabled, req.overrideValue)) {
		await refreshTabs();
	}
	return createUnitResponse();
}

async function handleSetDefaultStatus(req: SetDefaultStatusRequest): Promise<UnitResponse> {
	if ((await enabledByDefault()) !== req.enabled) {
		await setDefaultEnable(req.enabled);
		await refreshTabs();
	}
	return createUnitResponse();
}

async function handleSetUserDictionary(req: SetUserDictionaryRequest): Promise<UnitResponse> {
	await chrome.storage.local.set({ userDictionary: [...new Set(req.words)] });
	return createUnitResponse();
}

async function handleAddToUserDictionary(req: AddToUserDictionaryRequest): Promise<UnitResponse> {
	const words = new Set(await getUserDictionary());
	for (const word of req.words) {
		words.add(word);
	}
	await chrome.storage.local.set({ userDictionary: [...words] });
	return createUnitResponse();
}

async function handleGetUserDictionary(): Promise<GetUserDictionaryResponse> {
	return { kind: 'getUserDictionary', words: await getUserDictionary() };
}

async function handleGetActivationKey(): Promise<GetActivationKeyResponse> {
	const resp = await chrome.storage.local.get({ activationKey: ActivationKey.Off });
	return { kind: 'getActivationKey', key: resp.activationKey };
}

async function handleSetActivationKey(req: SetActivationKeyRequest): Promise<UnitResponse> {
	if (!Object.values(ActivationKey).includes(req.key)) {
		throw new Error(`Invalid activation key: ${req.key}`);
	}
	await chrome.storage.local.set({ activationKey: req.key });

	return createUnitResponse();
}

async function handleGetHotkey(): Promise<GetHotkeyResponse> {
	const resp = await chrome.storage.local.get({
		hotkey: { modifiers: ['Ctrl'], key: 'e' },
	});
	return { kind: 'getHotkey', hotkey: resp.hotkey as Hotkey };
}

async function handleSetHotkey(req: SetHotkeyRequest): Promise<UnitResponse> {
	// Create a plain object to avoid proxy cloning issues
	const hotkey = {
		modifiers: [...req.hotkey.modifiers],
		key: req.hotkey.key,
	};
	await chrome.storage.local.set({ hotkey });

	return createUnitResponse();
}

async function getServerSettings(): Promise<ServerSettings> {
	const resp = await chrome.storage.local.get({
		serverSettings: { serverUrl: __DEFAULT_SERVER_URL__, preferredVariants: '' },
	});
	return resp.serverSettings;
}

async function getDisabledRules(): Promise<string[]> {
	const resp = await chrome.storage.local.get({ disabledRules: [] });
	return resp.disabledRules;
}

async function setDisabledRules(rules: string[]): Promise<void> {
	const cleaned = [...new Set(rules.map((rule) => rule.trim()).filter((rule) => rule.length > 0))];
	await chrome.storage.local.set({ disabledRules: cleaned.sort() });
}

async function getDelay(): Promise<number> {
	const resp = await chrome.storage.local.get({ delay: DEFAULT_DELAY_MS });
	const { delay } = resp;

	return typeof delay === 'number' && Number.isFinite(delay) && delay >= 0
		? delay
		: DEFAULT_DELAY_MS;
}

async function getIgnoredLints(): Promise<string[]> {
	const resp = await chrome.storage.local.get({ ignoredLints: [] });
	return Array.isArray(resp.ignoredLints) ? resp.ignoredLints : [];
}

async function getUserDictionary(): Promise<string[]> {
	const resp = await chrome.storage.local.get({ userDictionary: [] });
	return Array.isArray(resp.userDictionary) ? resp.userDictionary : [];
}

/** Format the key to be used in local storage to store domain status. */
function formatDomainKey(domain: string): string {
	return `domainStatus ${domain}`;
}

/**
 * Looks up a domain-specific enable/disable setting in local storage.
 * The lookup is normalized through `domainLookupCandidates` so we can try
 * both the exact hostname and a `www.`-stripped variant when sites are stored
 * under either form. Returns `undefined` when no stored override exists.
 */
async function getStoredDomainStatus(domain: string): Promise<boolean | undefined> {
	const candidates = domainLookupCandidates(domain);
	const response = await chrome.storage.local.get(candidates.map(formatDomainKey));

	for (const candidate of candidates) {
		const value = response[formatDomainKey(candidate)];
		if (typeof value === 'boolean') {
			return value;
		}
	}

	return undefined;
}

/** Check if checking has been enabled for a given domain. */
async function enabledForDomain(domain: string): Promise<boolean> {
	const stored = await getStoredDomainStatus(domain);
	if (stored !== undefined) {
		return stored;
	}

	if (domainLookupCandidates(domain).some((candidate) => defaultEnabledDomainSet.has(candidate))) {
		return true;
	}

	return await enabledByDefault();
}

/** Set whether checking is enabled for a given domain. Returns whether storage changed.
 *
 * @param overrideValue dictates whether this should override a previous setting.
 * */
async function setDomainEnable(
	domain: string,
	status: boolean,
	overrideValue = true,
): Promise<boolean> {
	const candidates = domainLookupCandidates(domain);
	const stored = await chrome.storage.local.get(candidates.map(formatDomainKey));
	const storedHosts = new Set(
		candidates.filter((c) => typeof stored[formatDomainKey(c)] === 'boolean'),
	);
	if (!overrideValue && storedHosts.size > 0) {
		return false;
	}

	const key = formatDomainKey(domainWriteTarget(domain, storedHosts));
	if (stored[key] === status) {
		return false;
	}
	await chrome.storage.local.set({ [key]: status });
	return true;
}

/**
 * Tell content scripts to drop cached results, so a changed setting shows within
 * about a second. Tabs without a content script reject; that is expected.
 */
async function refreshTabs(tabIds?: number[]): Promise<void> {
	const ids =
		tabIds ??
		(await chrome.tabs.query({})).map((t) => t.id).filter((id): id is number => id != null);
	const message: RefreshMessage = { kind: 'refresh' };
	await Promise.all(ids.map((id) => chrome.tabs.sendMessage(id, message).catch(() => {})));
}

/** Set whether checking is enabled by default. */
async function setDefaultEnable(status: boolean) {
	await chrome.storage.local.set({ defaultEnable: status });
}

/** Check if checking has been enabled by default. */
async function enabledByDefault(): Promise<boolean> {
	const req = await chrome.storage.local.get({ defaultEnable: false });
	return req.defaultEnable;
}

/** Check whether the checking state has been set for a given domain. */
async function isDomainSet(domain: string): Promise<boolean> {
	return (await getStoredDomainStatus(domain)) !== undefined;
}
