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
import ProtocolClient from '../ProtocolClient';
import { ActivationKey, type Hotkey } from '../protocol';
import HotkeyRecorder from './HotkeyRecorder.svelte';

const activationKeyLabels: Record<ActivationKey, string> = {
	[ActivationKey.Shift]: 'Double Shift',
	[ActivationKey.Control]: 'Double Control',
	[ActivationKey.Off]: 'Off',
};

/** LanguageTool's free server; its limits suit a test, not daily use. */
const PUBLIC_SERVER_URL = 'https://api.languagetool.org';

let serverUrl = $state('');
let preferredVariants = $state('');
let serverStatus: { ok: boolean; message: string } | null = $state(null);
let serverBusy = $state(false);

let loaded = $state(false);
let loadError: string | null = $state(null);
let saveError: string | null = $state(null);
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

/** Runs a save and shows its failure; a later successful save hides the message again. */
async function save(promise: Promise<unknown>): Promise<boolean> {
	try {
		await promise;
		saveError = null;
		return true;
	} catch (e) {
		saveError = e instanceof Error ? e.message : String(e);
		return false;
	}
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
			serverStatus = { ok: false, message: 'Enter a URL that starts with https:// or http://.' };
			return;
		}

		// Must run first, while the click still counts as a user gesture.
		const granted = await chrome.permissions.request({ origins: [pattern] });
		if (!granted) {
			serverStatus = {
				ok: false,
				message: 'The browser did not grant access to this server. The setting was not saved.',
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
				: { ok: true, message: 'Checking is off until you set a server.' };
	} catch (e) {
		serverStatus = {
			ok: false,
			message: `Could not save: ${e instanceof Error ? e.message : String(e)}`,
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
		void save(ProtocolClient.setDelay(Number(value)));
	}
}

function onDefaultEnabledChange(checked: boolean) {
	defaultEnabled = checked;
	void save(ProtocolClient.setDefaultEnabled(checked));
}

function onActivationKeyChange(value: string) {
	activationKey = value as ActivationKey;
	void save(ProtocolClient.setActivationKey(activationKey));
}

function onHotkeyChange(next: Hotkey) {
	hotkey = next;
	void save(ProtocolClient.setHotkey(next));
}

$effect(() => {
	if (loaded) {
		void save(ProtocolClient.setUserDictionary(stringToList(userDict)));
	}
});

$effect(() => {
	if (loaded) {
		void save(ProtocolClient.setDisabledRules(stringToList(disabledRules)));
	}
});

async function clearIgnored() {
	if (await save(ProtocolClient.clearIgnoredLints())) {
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
    <PageHeader subtitle="Settings" />

    {#if saveError != null}
      <Alert.Root variant="destructive">
        <Alert.Description>Could not save: {saveError}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if loadError != null}
      <Alert.Root variant="destructive">
        <Alert.Description>Could not load the settings: {loadError}</Alert.Description>
      </Alert.Root>
    {/if}

    <Card.Root>
      <Card.Header><Card.Title>Server</Card.Title></Card.Header>
      <Card.Content class="flex flex-col gap-6">
        <div class="grid gap-2 sm:grid-cols-[1fr_18rem] sm:items-center">
          {@render row('server-url', 'Server URL', 'For example https://lt.example.com or http://localhost:8081. Leave empty to turn checking off.')}
          <Input id="server-url" placeholder="https://lt.example.com" bind:value={serverUrl} />
        </div>
        {#if loaded && serverUrl.trim().length === 0}
          <div class="flex flex-col gap-2 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p class="text-muted-foreground">
              No server of your own? For a test, use the public server of
              <a class="text-foreground underline underline-offset-4" href="https://languagetool.org" target="_blank" rel="noreferrer">LanguageTool</a>.
              It has usage limits, and your text goes to LanguageTool.
            </p>
            <Button variant="outline" size="sm" onclick={() => (serverUrl = PUBLIC_SERVER_URL)}>
              Use public server
            </Button>
          </div>
        {/if}
        <div class="grid gap-2 sm:grid-cols-[1fr_18rem] sm:items-center">
          {@render row('preferred-variants', 'Preferred variants', 'Comma-separated, for example de-CH,en-GB. The server uses them when it detects the language of a text.')}
          <Input id="preferred-variants" placeholder="de-CH,en-GB" bind:value={preferredVariants} />
        </div>
        {#if serverStatus}
          <Alert.Root variant={serverStatus.ok ? 'default' : 'destructive'}>
            <Alert.Description>
              {serverStatus.ok ? `Connected: ${serverStatus.message}` : serverStatus.message}
            </Alert.Description>
          </Alert.Root>
        {/if}
        <div class="flex justify-end">
          <Button disabled={serverBusy} onclick={saveServer}>Save and Test</Button>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title>General</Card.Title></Card.Header>
      <Card.Content class="flex flex-col gap-6">
        <div class="flex items-center justify-between gap-4">
          {@render row('default-enabled', 'Enable on new sites', 'Can make some apps behave abnormally.')}
          <Switch id="default-enabled" checked={defaultEnabled} onCheckedChange={onDefaultEnabledChange} />
        </div>
        <div class="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-start">
          {@render row('delay', 'Delay', 'Wait this many milliseconds after typing stops before checking the text again.')}
          <div class="flex flex-col gap-1">
            <Input id="delay" type="text" inputmode="numeric" value={delayText} oninput={(e) => onDelayInput(e.currentTarget.value)} aria-invalid={delayError} aria-describedby={delayError ? 'delay-error' : undefined} />
            {#if delayError}
              <p id="delay-error" class="text-destructive text-sm">Enter a whole number of milliseconds between 0 and 60000.</p>
            {/if}
          </div>
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('activation-key', 'Activation key', 'Show highlights only after you press this key twice.')}
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
          {@render row('hotkey', 'Apply-suggestion hotkey', 'Applies the first suggestion to the last marked word.')}
          <HotkeyRecorder id="hotkey" {hotkey} onchange={onHotkeyChange} />
        </div>
        <div class="flex flex-col gap-2">
          {@render row('user-dictionary', 'User dictionary', 'One word per line. These words are never marked as spelling mistakes.')}
          <Textarea id="user-dictionary" rows={6} bind:value={userDict} />
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('export-domains', 'Export enabled domains', 'Downloads a JSON list of the sites where checking is on.')}
          <Button id="export-domains" variant="outline" onclick={exportEnabledDomainsJSON}>Export JSON</Button>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title>Rules</Card.Title></Card.Header>
      <Card.Content class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          {@render row('disabled-rules', 'Disabled rules', 'LanguageTool rule IDs, one per line. "Disable rule" in a suggestion adds its rule here.')}
          <Textarea id="disabled-rules" rows={6} bind:value={disabledRules} />
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('clear-ignored', 'Ignored suggestions', 'Show all suggestions again that you ignored.')}
          <Button id="clear-ignored" variant="outline" disabled={ignoredCleared} onclick={clearIgnored}>
            {ignoredCleared ? 'Cleared' : 'Clear'}
          </Button>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</main>
