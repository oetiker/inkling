import type { LintOptions, UnpackedLintGroups } from 'lint-framework';

export type Request =
	| LintRequest
	| GetServerSettingsRequest
	| SetServerSettingsRequest
	| TestServerRequest
	| GetDisabledRulesRequest
	| SetDisabledRulesRequest
	| SetRuleEnabledRequest
	| GetDelayRequest
	| SetDelayRequest
	| SetDomainStatusRequest
	| SetDefaultStatusRequest
	| GetDomainStatusRequest
	| GetDefaultStatusRequest
	| GetEnabledDomainsRequest
	| AddToUserDictionaryRequest
	| SetUserDictionaryRequest
	| GetUserDictionaryRequest
	| IgnoreLintRequest
	| ClearIgnoredLintsRequest
	| GetActivationKeyRequest
	| SetActivationKeyRequest
	| GetHotkeyRequest
	| SetHotkeyRequest
	| OpenOptionsRequest
	| GetTabPausedRequest
	| SetTabPausedRequest
	| PageStartedRequest;

export type Response =
	| LintResponse
	| UnitResponse
	| GetServerSettingsResponse
	| TestServerResponse
	| GetDisabledRulesResponse
	| GetDelayResponse
	| GetDomainStatusResponse
	| GetDefaultStatusResponse
	| GetEnabledDomainsResponse
	| GetUserDictionaryResponse
	| GetHotkeyResponse
	| GetActivationKeyResponse
	| GetTabPausedResponse
	| ErrorResponse;

export type LintRequest = {
	kind: 'lint';
	domain: string;
	text: string;
	options?: LintOptions;
};

export type LintResponse = {
	kind: 'lints';
	lints: UnpackedLintGroups;
};

/** How to reach the LanguageTool server. */
export type ServerSettings = {
	/** Base URL of the server, such as `https://lt.example.com`. Empty disables checking. */
	serverUrl: string;
	/** Comma-separated language variants, such as `de-CH,en-GB`, preferred by language detection. */
	preferredVariants: string;
};

export type GetServerSettingsRequest = {
	kind: 'getServerSettings';
};

export type GetServerSettingsResponse = {
	kind: 'getServerSettings';
	settings: ServerSettings;
};

export type SetServerSettingsRequest = {
	kind: 'setServerSettings';
	settings: ServerSettings;
};

export type TestServerRequest = {
	kind: 'testServer';
	serverUrl: string;
};

export type TestServerResponse = {
	kind: 'testServer';
	ok: boolean;
	/** The server's software version on success, or the error otherwise. */
	message: string;
};

export type GetDisabledRulesRequest = {
	kind: 'getDisabledRules';
};

export type GetDisabledRulesResponse = {
	kind: 'getDisabledRules';
	rules: string[];
};

export type SetDisabledRulesRequest = {
	kind: 'setDisabledRules';
	rules: string[];
};

export type SetRuleEnabledRequest = {
	kind: 'setRuleEnabled';
	ruleId: string;
	enabled: boolean;
};

export type GetDelayRequest = {
	kind: 'getDelay';
};

export type GetDelayResponse = {
	kind: 'getDelay';
	delay: number;
};

export type SetDelayRequest = {
	kind: 'setDelay';
	delay: number;
};

export type GetDomainStatusRequest = {
	kind: 'getDomainStatus';
	domain: string;
};

export type GetDomainStatusResponse = {
	kind: 'getDomainStatus';
	domain: string;
	enabled: boolean;
};

export type GetDefaultStatusRequest = {
	kind: 'getDefaultStatus';
};

export type GetDefaultStatusResponse = {
	kind: 'getDefaultStatus';
	enabled: boolean;
};

export type GetEnabledDomainsRequest = {
	kind: 'getEnabledDomains';
};

export type GetEnabledDomainsResponse = {
	kind: 'getEnabledDomains';
	domains: string[];
};

export type SetDomainStatusRequest = {
	kind: 'setDomainStatus';
	domain: string;
	enabled: boolean;
	/** Dictates whether this should override a previous setting. */
	overrideValue: boolean;
};

export type SetDefaultStatusRequest = {
	kind: 'setDefaultStatus';
	enabled: boolean;
};

export type AddToUserDictionaryRequest = {
	kind: 'addToUserDictionary';
	words: string[];
};

export type SetUserDictionaryRequest = {
	kind: 'setUserDictionary';
	words: string[];
};

export type GetUserDictionaryRequest = {
	kind: 'getUserDictionary';
};

export type GetUserDictionaryResponse = {
	kind: 'getUserDictionary';
	words: string[];
};

export type IgnoreLintRequest = {
	kind: 'ignoreLint';
	contextHash: string;
};

export type ClearIgnoredLintsRequest = {
	kind: 'clearIgnoredLints';
};

export enum ActivationKey {
	Off = 'off',
	Shift = 'shift',
	Control = 'control',
}

export type GetActivationKeyRequest = {
	kind: 'getActivationKey';
};

export type GetActivationKeyResponse = {
	kind: 'getActivationKey';
	key: ActivationKey;
};

export type SetActivationKeyRequest = {
	kind: 'setActivationKey';
	key: ActivationKey;
};

export type Modifier = 'Ctrl' | 'Shift' | 'Alt';

export type Hotkey = {
	modifiers: Modifier[];
	key: string;
};

export type GetHotkeyRequest = {
	kind: 'getHotkey';
};

export type GetHotkeyResponse = {
	kind: 'getHotkey';
	hotkey: Hotkey;
};

export type SetHotkeyRequest = {
	kind: 'setHotkey';
	hotkey: Hotkey;
};

export type OpenOptionsRequest = {
	kind: 'openOptions';
};

/** Sent by the background to content scripts when a setting changed. */
export type RefreshMessage = {
	kind: 'refresh';
};

export type UnitResponse = {
	kind: 'unit';
};

export function createUnitResponse(): UnitResponse {
	return { kind: 'unit' };
}

export type GetTabPausedRequest = {
	kind: 'getTabPaused';
	tabId: number;
};

export type GetTabPausedResponse = {
	kind: 'getTabPaused';
	paused: boolean;
};

export type SetTabPausedRequest = {
	kind: 'setTabPaused';
	tabId: number;
	paused: boolean;
};

/** Sent by the top frame's content script when a new document starts or is shown again. */
export type PageStartedRequest = {
	kind: 'pageStarted';
	/** When the document started, in ms since the epoch. A pause set earlier ends. */
	startedAt: number;
};

/** Sent instead of a normal response when the background failed to handle a request. */
export type ErrorResponse = {
	kind: 'error';
	message: string;
};

export function createErrorResponse(error: unknown): ErrorResponse {
	return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
}

/** Returns the response, or throws when it is an error response. */
export function unwrapResponse<T>(response: T | ErrorResponse): T {
	if ((response as ErrorResponse | undefined)?.kind === 'error') {
		throw new Error((response as ErrorResponse).message);
	}
	return response as T;
}
