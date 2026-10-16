<script lang="ts">
import * as Alert from '$lib/components/ui/alert/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import * as Select from '$lib/components/ui/select/index.js';
import { Switch } from '$lib/components/ui/switch/index.js';
import { Textarea } from '$lib/components/ui/textarea/index.js';
import PageHeader from '../components/PageHeader.svelte';
import { t, tAround } from '../i18n';
import ProtocolClient from '../ProtocolClient';
import { ActivationKey, type Hotkey } from '../protocol';
import HotkeyRecorder from './HotkeyRecorder.svelte';

const activationKeyLabels: Record<ActivationKey, string> = {
	[ActivationKey.Shift]: t('activationKeyShift'),
	[ActivationKey.Control]: t('activationKeyControl'),
	[ActivationKey.Off]: t('activationKeyOff'),
};

/** The names of the settings as the page labels them, for save failures. */
const settingLabels: Record<string, string> = {
	delay: t('delay'),
	defaultEnabled: t('defaultEnabled'),
	activationKey: t('activationKey'),
	hotkey: t('hotkey'),
	userDictionary: t('userDictionary'),
	disabledRules: t('disabledRules'),
	ignoredLints: t('ignoredSuggestions'),
};

const [publicServerBefore, publicServerAfter] = tAround('publicServerHint');

/** LanguageTool's free server; its limits suit a test, not daily use. */
const PUBLIC_SERVER_URL = 'https://api.languagetool.org';

let serverUrl = $state('');
let preferredVariants = $state('');
let serverStatus: { ok: boolean; message: string } | null = $state(null);
let serverBusy = $state(false);

let loaded = $state(false);
let loadError: string | null = $state(null);
/** The failure of the latest save of each setting that failed, keyed by setting. */
let saveErrors: Record<string, string> = $state({});
/** The number of the latest save started for each setting. */
const latestSave: Record<string, number> = {};
let saveCount = 0;
let defaultEnabled = $state(false);
let delayText = $state('');
let delayError = $state(false);
let activationKey: ActivationKey = $state(ActivationKey.Off);
let hotkey: Hotkey = $state({ modifiers: ['Ctrl'], key: 'e' });
let userDict = $state('');
let disabledRules = $state('');
let ignoredCleared = $state(false);

Promise.all([
	ProtocolClient.getServerSettings(),
	ProtocolClient.getDefaultEnabled(),
	ProtocolClient.getDelay(),
	ProtocolClient.getActivationKey(),
	ProtocolClient.getHotkey(),
	ProtocolClient.getUserDictionary(),
	ProtocolClient.getDisabledRules(),
])
	.then(([server, enabled, delay, key, hk, dict, rules]) => {
		serverUrl = server.serverUrl;
		preferredVariants = server.preferredVariants;
		defaultEnabled = enabled;
		delayText = String(delay);
		activationKey = key;
		hotkey = { modifiers: [...hk.modifiers], key: hk.key };
		userDict = listToString(dict.toSorted());
		disabledRules = listToString(rules);
		loaded = true;
	})
	.catch((e) => {
		// Leave `loaded` false so the dictionary and rules effects never save the defaults.
		loadError = e instanceof Error ? e.message : String(e);
	});

/**
 * Runs a save of `setting` and shows its failure. Only a later save of the same setting
 * hides the message again, and only the latest save of a setting decides it, so saves
 * that finish out of order neither hide a failure nor revive an old one.
 */
async function save(setting: string, promise: Promise<unknown>): Promise<boolean> {
	const id = ++saveCount;
	latestSave[setting] = id;
	let error: string | null = null;
	try {
		await promise;
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}
	if (latestSave[setting] === id) {
		if (error == null) {
			delete saveErrors[setting];
		} else {
			saveErrors[setting] = error;
		}
	}
	return error == null;
}

/** Converts the content of a text area to a list with one entry per line. */
function stringToList(s: string): string[] {
	return s
		.split('\n')
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}

function listToString(values: string[]): string {
	return values.map((v) => v.trim()).join('\n');
}

/** The origin pattern to request host access for, or null for an invalid URL. */
function originPattern(url: string): string | null {
	try {
		const parsed = new URL(url.trim());
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
			return null;
		}
		return `${parsed.protocol}//${parsed.hostname}/*`;
	} catch {
		return null;
	}
}

async function saveServer() {
	serverStatus = null;

	const trimmed = serverUrl.trim();
	if (trimmed.length > 0) {
		const pattern = originPattern(trimmed);
		if (pattern == null) {
			serverStatus = { ok: false, message: t('invalidServerUrl') };
			return;
		}

		// Must run first, while the click still counts as a user gesture. A denied request
		// resolves false or, depending on browser and how the prompt was closed, rejects.
		let granted = false;
		try {
			granted = await chrome.permissions.request({ origins: [pattern] });
		} catch (e) {
			console.warn('Permission request failed', e);
		}
		if (!granted) {
			serverStatus = {
				ok: false,
				message: t('serverPermissionDenied', new URL(trimmed).origin),
			};
			return;
		}
	}

	serverBusy = true;
	try {
		await ProtocolClient.setServerSettings({ serverUrl: trimmed, preferredVariants });
		serverStatus =
			trimmed.length > 0
				? await ProtocolClient.testServer(trimmed)
				: { ok: true, message: t('checkingOffWithoutServer') };
	} catch (e) {
		serverStatus = {
			ok: false,
			message: t('couldNotSave', e instanceof Error ? e.message : String(e)),
		};
	} finally {
		serverBusy = false;
	}
}

const MAX_DELAY_MS = 60000;

function onDelayInput(raw: string) {
	delayText = raw;
	const value = raw.trim();
	const ok = /^\d+$/.test(value) && Number(value) <= MAX_DELAY_MS;
	delayError = !ok;
	if (ok) {
		void save('delay', ProtocolClient.setDelay(Number(value)));
	}
}

function onDefaultEnabledChange(checked: boolean) {
	defaultEnabled = checked;
	void save('defaultEnabled', ProtocolClient.setDefaultEnabled(checked));
}

function onActivationKeyChange(value: string) {
	activationKey = value as ActivationKey;
	void save('activationKey', ProtocolClient.setActivationKey(activationKey));
}

function onHotkeyChange(next: Hotkey) {
	hotkey = next;
	void save('hotkey', ProtocolClient.setHotkey(next));
}

$effect(() => {
	if (loaded) {
		void save('userDictionary', ProtocolClient.setUserDictionary(stringToList(userDict)));
	}
});

$effect(() => {
	if (loaded) {
		void save('disabledRules', ProtocolClient.setDisabledRules(stringToList(disabledRules)));
	}
});

async function clearIgnored() {
	if (await save('ignoredLints', ProtocolClient.clearIgnoredLints())) {
		ignoredCleared = true;
	}
}

async function exportEnabledDomainsJSON() {
	try {
		const enabledDomains = await ProtocolClient.getEnabledDomains();
		const blob = new Blob([JSON.stringify(enabledDomains, null, 2)], {
			type: 'application/json;charset=utf-8',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'enabled-domains.json';
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	} catch (e) {
		console.error('Failed to export enabled domains JSON:', e);
	}
}
</script>

{#snippet row(id: string, label: string, help: string)}
  <div class="flex flex-col gap-1">
    <Label id="{id}-label" for={id}>{label}</Label>
    <p class="text-muted-foreground text-sm">{help}</p>
  </div>
{/snippet}

<main class="bg-background text-foreground min-h-screen px-4 py-10">
  <div class="mx-auto flex max-w-2xl flex-col gap-6">
    <PageHeader subtitle={t('settingsSubtitle')} />

    {#each Object.entries(saveErrors) as [setting, error] (setting)}
      <Alert.Root variant="destructive">
        <Alert.Description>{t('couldNotSaveSetting', settingLabels[setting], error)}</Alert.Description>
      </Alert.Root>
    {/each}

    {#if loadError != null}
      <Alert.Root variant="destructive">
        <Alert.Description>{t('couldNotLoad', loadError)}</Alert.Description>
      </Alert.Root>
    {/if}

    <Card.Root>
      <Card.Header><Card.Title>{t('serverCard')}</Card.Title></Card.Header>
      <Card.Content class="flex flex-col gap-6">
        <div class="grid gap-2 sm:grid-cols-[1fr_18rem] sm:items-center">
          {@render row('server-url', t('serverUrl'), t('serverUrlHelp'))}
          <Input id="server-url" placeholder="https://lt.example.com" bind:value={serverUrl} />
        </div>
        {#if loaded && serverUrl.trim().length === 0}
          <div class="flex flex-col gap-2 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p class="text-muted-foreground">
              {publicServerBefore}<a class="text-foreground underline underline-offset-4" href="https://languagetool.org" target="_blank" rel="noreferrer">LanguageTool</a>{publicServerAfter}
            </p>
            <Button variant="outline" size="sm" onclick={() => (serverUrl = PUBLIC_SERVER_URL)}>
              {t('usePublicServer')}
            </Button>
          </div>
        {/if}
        <div class="grid gap-2 sm:grid-cols-[1fr_18rem] sm:items-center">
          {@render row('preferred-variants', t('preferredVariants'), t('preferredVariantsHelp'))}
          <Input id="preferred-variants" placeholder="de-CH,en-GB" bind:value={preferredVariants} />
        </div>
        {#if serverStatus}
          <Alert.Root variant={serverStatus.ok ? 'default' : 'destructive'}>
            <Alert.Description>
              {serverStatus.ok ? t('connected', serverStatus.message) : serverStatus.message}
            </Alert.Description>
          </Alert.Root>
        {/if}
        <div class="flex justify-end">
          <Button disabled={serverBusy} onclick={saveServer}>{t('saveAndTest')}</Button>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title>{t('generalCard')}</Card.Title></Card.Header>
      <Card.Content class="flex flex-col gap-6">
        <div class="flex items-center justify-between gap-4">
          {@render row('default-enabled', t('defaultEnabled'), t('defaultEnabledHelp'))}
          <Switch id="default-enabled" checked={defaultEnabled} onCheckedChange={onDefaultEnabledChange} />
        </div>
        <div class="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-start">
          {@render row('delay', t('delay'), t('delayHelp'))}
          <div class="flex flex-col gap-1">
            <Input id="delay" type="text" inputmode="numeric" value={delayText} oninput={(e) => onDelayInput(e.currentTarget.value)} aria-invalid={delayError} aria-describedby={delayError ? 'delay-error' : undefined} />
            {#if delayError}
              <p id="delay-error" class="text-destructive text-sm">{t('delayError')}</p>
            {/if}
          </div>
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('activation-key', t('activationKey'), t('activationKeyHelp'))}
          <Select.Root type="single" value={activationKey} onValueChange={onActivationKeyChange}>
            <Select.Trigger id="activation-key" class="w-44">{activationKeyLabels[activationKey]}</Select.Trigger>
            <Select.Content>
              {#each [ActivationKey.Shift, ActivationKey.Control, ActivationKey.Off] as key}
                <Select.Item value={key}>{activationKeyLabels[key]}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('hotkey', t('hotkey'), t('hotkeyHelp'))}
          <HotkeyRecorder id="hotkey" {hotkey} onchange={onHotkeyChange} />
        </div>
        <div class="flex flex-col gap-2">
          {@render row('user-dictionary', t('userDictionary'), t('userDictionaryHelp'))}
          <Textarea id="user-dictionary" rows={6} bind:value={userDict} />
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('export-domains', t('exportDomains'), t('exportDomainsHelp'))}
          <Button id="export-domains" variant="outline" onclick={exportEnabledDomainsJSON}>{t('exportJson')}</Button>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title>{t('rulesCard')}</Card.Title></Card.Header>
      <Card.Content class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          {@render row('disabled-rules', t('disabledRules'), t('disabledRulesHelp'))}
          <Textarea id="disabled-rules" rows={6} bind:value={disabledRules} />
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('clear-ignored', t('ignoredSuggestions'), t('ignoredSuggestionsHelp'))}
          <Button id="clear-ignored" variant="outline" disabled={ignoredCleared} onclick={clearIgnored}>
            {ignoredCleared ? t('cleared') : t('clear')}
          </Button>
        </div>
      </Card.Content>
    </Card.Root>

    <footer class="text-muted-foreground text-center text-sm">
      {t('sourceCode')}
      <a class="text-foreground underline underline-offset-4" href="https://github.com/oetiker/inkling" target="_blank" rel="noreferrer">github.com/oetiker/inkling</a>
    </footer>
  </div>
</main>
