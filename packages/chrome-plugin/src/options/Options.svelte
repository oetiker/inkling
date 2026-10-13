<script lang="ts">
import { Button, Card, Input, Select, Textarea } from 'components';
import logo from '/logo.png';
import ProtocolClient from '../ProtocolClient';
import type { Hotkey, Modifier } from '../protocol';
import { ActivationKey } from '../protocol';

let serverUrl = $state('');
let preferredVariants = $state('');
let serverStatus: { ok: boolean; message: string } | null = $state(null);
let serverBusy = $state(false);
let disabledRules = $state('');
let disabledRulesLoaded = $state(false);
let delay = $state(0);
let delayLoaded = $state(false);
let defaultEnabled = $state(false);
let defaultEnabledLoaded = $state(false);
let activationKey: ActivationKey = $state(ActivationKey.Off);
let activationKeyLoaded = $state(false);
let userDict = $state('');
let userDictLoaded = $state(false);
let ignoredCleared = $state(false);
let modifyHotkeyButton: Button;
let hotkey: Hotkey = $state({ modifiers: ['Ctrl'], key: 'e' });

$effect(() => {
	if (delayLoaded) {
		ProtocolClient.setDelay(delay);
	}
});

$effect(() => {
	if (defaultEnabledLoaded) {
		ProtocolClient.setDefaultEnabled(defaultEnabled);
	}
});

$effect(() => {
	if (activationKeyLoaded) {
		ProtocolClient.setActivationKey(activationKey);
	}
});

$effect(() => {
	if (userDictLoaded) {
		ProtocolClient.setUserDictionary(stringToList(userDict));
	}
});

$effect(() => {
	if (disabledRulesLoaded) {
		ProtocolClient.setDisabledRules(stringToList(disabledRules));
	}
});

ProtocolClient.getServerSettings().then((s) => {
	serverUrl = s.serverUrl;
	preferredVariants = s.preferredVariants;
});

ProtocolClient.getDisabledRules().then((rules) => {
	disabledRules = listToString(rules);
	disabledRulesLoaded = true;
});

ProtocolClient.getDelay().then((value) => {
	delay = value;
	delayLoaded = true;
});

ProtocolClient.getDefaultEnabled().then((d) => {
	defaultEnabled = d;
	defaultEnabledLoaded = true;
});

ProtocolClient.getActivationKey().then((d) => {
	activationKey = d;
	activationKeyLoaded = true;
});

ProtocolClient.getHotkey().then((d) => {
	hotkey = {
		modifiers: [...d.modifiers],
		key: d.key,
	};
	buttonText = `Hotkey: ${d.modifiers.join('+')}+${d.key}`;
});

ProtocolClient.getUserDictionary().then((d) => {
	userDict = listToString(d.toSorted());
	userDictLoaded = true;
});

/** Converts the content of a text area to a list with one entry per line. */
function stringToList(s: string): string[] {
	return s
		.split('\n')
		.map((s) => s.trim())
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
	} finally {
		serverBusy = false;
	}
}

async function clearIgnored() {
	await ProtocolClient.clearIgnoredLints();
	ignoredCleared = true;
}

async function exportEnabledDomainsJSON() {
	try {
		const enabledDomains = await ProtocolClient.getEnabledDomains();
		const json = JSON.stringify(enabledDomains, null, 2);

		const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
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

let buttonText = $state('Set Hotkey');
let isBlue = $state(false); // modify color of hotkey button once it is pressed
function startHotkeyCapture(_modifyHotkeyButton: Button) {
	buttonText = 'Press desired hotkey combination now.';

	const handleKeydown = (event: KeyboardEvent) => {
		event.preventDefault();

		const modifiers: Modifier[] = [];
		if (event.ctrlKey) modifiers.push('Ctrl');
		if (event.shiftKey) modifiers.push('Shift');
		if (event.altKey) modifiers.push('Alt');

		let key = event.key;

		if (key !== 'Control' && key !== 'Shift' && key !== 'Alt') {
			if (modifiers.length === 0) {
				return;
			}
			buttonText = `Hotkey: ${modifiers.join('+')}+${key}`;
			// Create a plain object to avoid proxy cloning issues
			const newHotkey = {
				modifiers: [...modifiers],
				key: key,
			};

			hotkey = newHotkey;

			// Call ProtocolClient directly with the plain object to avoid proxy issues
			ProtocolClient.setHotkey(newHotkey);

			// Remove listener
			window.removeEventListener('keydown', handleKeydown);

			// change button color
			isBlue = !isBlue;
		}
	};

	// Add temporary key listener
	window.addEventListener('keydown', handleKeydown);
}
</script>

<!-- centered wrapper with side gutters -->
<div class="min-h-screen px-4 py-10">
  <div class="mx-auto max-w-screen-lg space-y-4">
    <Card class="flex items-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-xl">
        <img src={logo} alt="" class="h-5 w-auto" />
      </div>
      <div class="flex flex-col">
        <h1 class="text-base tracking-wide font-serif">{chrome.runtime.getManifest().name}</h1>
        <p class="text-xs">Settings</p>
      </div>
    </Card>

    <!-- ── SERVER ────────────────────────────── -->
    <Card class="space-y-6">
      <h2 class="pb-1 text-xs uppercase tracking-wider">LanguageTool Server</h2>

      <div class="space-y-5">
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col">
            <h3 class="text-sm">Server URL</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              For example <code>https://lt.example.com</code> or
              <code>http://localhost:8081</code>. Leave empty to turn checking off.
            </p>
          </div>
          <Input
            size="sm"
            class="w-72"
            placeholder="https://lt.example.com"
            data-testid="server-url"
            bind:value={serverUrl}
          />
        </div>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col">
            <h3 class="text-sm">Preferred Variants</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Comma-separated, for example <code>de-CH,en-GB</code>. The server
              uses them when it detects the language of a text.
            </p>
          </div>
          <Input
            size="sm"
            class="w-72"
            placeholder="de-CH,en-GB"
            data-testid="preferred-variants"
            bind:value={preferredVariants}
          />
        </div>
      </div>

      <div class="flex items-center justify-between gap-4">
        <p
          class="text-xs {serverStatus?.ok === false ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}"
          data-testid="server-status"
        >
          {#if serverStatus}
            {serverStatus.ok ? `Connected: ${serverStatus.message}` : serverStatus.message}
          {/if}
        </p>
        <Button size="sm" disabled={serverBusy} on:click={saveServer}>Save and Test</Button>
      </div>
    </Card>

    <!-- ── GENERAL ───────────────────────────── -->
    <Card class="space-y-6">
      <h2 class="pb-1 text-xs uppercase tracking-wider">General</h2>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <h3 class="text-sm">Enable on New Sites by Default</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Can make some apps behave abnormally.
            </p>
          </div>
          <input
            type="checkbox"
            bind:checked={defaultEnabled}
            class="h-5 w-5"
          />
        </div>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col">
            <h3 class="text-sm">Delay</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Wait this many milliseconds after typing stops before checking
              the text again.
            </p>
          </div>
          <input
            type="number"
            min="0"
            step="50"
            bind:value={delay}
            class="w-44 rounded-lg border border-cream-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-cream-300 focus:ring-2 focus:ring-primary-300 dark:border-cream-700 dark:bg-cream-900 dark:text-white dark:focus:border-cream-600 dark:focus:ring-primary-600"
          />
        </div>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <h3 class="text-sm">Export Enabled Domains</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Downloads JSON of domains explicitly enabled.
            </p>
          </div>
          <Button size="sm" on:click={exportEnabledDomainsJSON}
            >Export JSON</Button
          >
        </div>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <h3 class="text-sm">Activation Key</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Show highlights only after you press this key twice.
            </p>
          </div>
          <Select size="sm" class="w-44" bind:value={activationKey}>
            <option value={ActivationKey.Shift}>Double Shift</option>
            <option value={ActivationKey.Control}>Double Control</option>
            <option value={ActivationKey.Off}>Off</option>
          </Select>
        </div>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <h3 class="text-sm">Apply Last Suggestion Hotkey</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Applies suggestion to last highlighted word.
            </p>
          </div>
          <Textarea readonly bind:value={buttonText} />
          <Button
            size="sm"
            color="light"
            style="background-color: {isBlue ? 'blue' : ''}"
            bind:this={modifyHotkeyButton}
            on:click={() => {
              startHotkeyCapture(modifyHotkeyButton);
              isBlue = !isBlue;
            }}>Modify Hotkey</Button
          >
        </div>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <h3 class="text-sm">User Dictionary</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Each word should be on its own line. These words are never
              marked as spelling mistakes.
            </p>
          </div>
          <Textarea bind:value={userDict}></Textarea>
        </div>
      </div>
    </Card>

    <!-- ── RULES ─────────────────────────────── -->
    <Card class="space-y-6">
      <h2 class="pb-1 text-xs uppercase tracking-wider">Rules</h2>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <h3 class="text-sm">Disabled Rules</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              LanguageTool rule IDs, one per line. "Disable rule" in a
              suggestion adds its rule here.
            </p>
          </div>
          <Textarea data-testid="disabled-rules" bind:value={disabledRules}></Textarea>
        </div>
      </div>

      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <h3 class="text-sm">Ignored Suggestions</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Show all suggestions again that you ignored.
            </p>
          </div>
          <Button size="sm" disabled={ignoredCleared} on:click={clearIgnored}>
            {ignoredCleared ? 'Cleared' : 'Clear'}
          </Button>
        </div>
      </div>
    </Card>
  </div>
</div>
