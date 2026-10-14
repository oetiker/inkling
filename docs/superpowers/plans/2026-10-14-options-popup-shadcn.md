# Options Page and Popup with shadcn-svelte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the options page and popup of the Inkling extension with stock shadcn-svelte, add a per-tab pause, fix the per-site switch on `www.` hosts, make setting changes reach open pages at once, and delete Harper's `packages/components`.

**Architecture:** shadcn-svelte components are vendored into `packages/extension/src/lib/components/ui/` by the CLI. Background logic stays in `src/background/index.ts`; the new pure `www.` matching goes to `src/background/domainKeys.ts`. New protocol messages (`getTabPaused`, `setTabPaused`, `pageStarted`, and `refresh` from background to content script) are added to `src/protocol.ts` and `src/ProtocolClient.ts`. Pause state lives in `chrome.storage.session`, one key per tab.

**Tech Stack:** Svelte 5 (runes), Tailwind CSS 4, shadcn-svelte 1.7.0 (CLI), bits-ui, `@lucide/svelte`, Vite 5 + `@crxjs/vite-plugin`, Playwright 1.60 (Chromium + Firefox), `node --test` for unit tests, Biome for lint/format.

**Spec:** [docs/superpowers/specs/2026-10-14-options-popup-shadcn-design.md](../specs/2026-10-14-options-popup-shadcn-design.md) — read it before starting any task.

## Global Constraints

- Package manager: **pnpm** only. Never npm or yarn.
- Look: stock shadcn-svelte, base color `neutral`. No custom palette, no custom fonts.
- No Google Fonts: no `fonts.googleapis.com` / `fonts.gstatic.com` anywhere in the extension.
- Every current setting stays: server URL, preferred variants, enable on new sites, delay, export enabled domains, activation key, apply-suggestion hotkey, user dictionary, disabled rules, clear ignored suggestions.
- Both page headers show `public/logo.svg`, "Inkling" and the version.
- No "harper" in identifiers, titles or comments. Product name "Inkling".
- Firefox minimum stays `strict_min_version: '146.0'`. No new permission in the release manifest (no `webNavigation`).
- `chrome.permissions.request` must stay the first `await` in the "Save and Test" click handler (user-gesture rule).
- Code comments and identifiers in English.
- `CHANGES.md` at repo root: user-facing wording, no release headers, max three sentences per entry.
- Builds and tests never use more than 4 cores. Wrap Playwright runs: `systemd-run --user --scope -p MemoryMax=6G -- make test-chromium`.
- Before any manual Chromium run or copying `build/` anywhere, rebuild for Chrome: `make test-firefox` leaves a Firefox build in `packages/extension/build/`.
- Several Claude sessions commit in this checkout on `main`. Before each commit: `git status`, `git log -3`; stage by path only.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gates before every commit (from repo root): `make lint`, `make check`, `make test-unit`, `make test-chromium`, `make test-firefox`.

## Review Focus

1. **Iframe or late `pageStarted`** (pause clicked while the page still loads, or an iframe's content script starting): only the top frame may end a pause. Task 4 test "A pause covers frames inside the tab" pins the iframe half (the iframe's content script starts after the pause would otherwise clear it — the handler checks `sender.frameId === 0`). A pause clicked before the top frame's content script starts is ended by it; that is accepted behaviour, not tested.
2. **Iframe content in a paused tab** (editors inside frames): must be paused too. Task 4 test "pause covers frames" uses `tests/pages/iframe_textarea.html`.
3. **Popup opened on a page without a content script** (tab opened before install/reload, `chrome://`): `refresh` and `getTabPaused` must not throw into the UI. Task 3 swallows `sendMessage` errors; Task 5 test "cannot check this page" uses `about:blank`.
4. **Options page opened with stored values missing** (fresh profile): every field shows its default, no `undefined` in inputs. Task 2 test "fresh profile shows defaults".
5. **Delay typed as text or negative** (`-5`, `abc`, empty): nothing saved, error shown, stored value unchanged. Task 2 test "invalid delay is rejected" covers `''` and `-5`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/extension/components.json` | shadcn-svelte CLI config (create) |
| `packages/extension/src/lib/utils.ts` | `cn()` helper from the CLI (create) |
| `packages/extension/src/lib/components/ui/**` | vendored shadcn components (create via CLI) |
| `packages/extension/app.css` | Tailwind 4 + shadcn theme variables (replace) |
| `packages/extension/src/components/PageHeader.svelte` | logo + name + version header shared by both pages (create) |
| `packages/extension/src/options/Options.svelte` | options page (rewrite) |
| `packages/extension/src/options/HotkeyRecorder.svelte` | hotkey display + recording (create) |
| `packages/extension/src/popup/Popup.svelte` | popup shell: header, body, footer (rewrite) |
| `packages/extension/src/popup/SiteControls.svelte` | site row: switch, pause, status (create; replaces `Main.svelte`) |
| `packages/extension/src/popup/currentTab.ts` | resolve the tab the popup acts on, incl. `?tab=` (create) |
| `packages/extension/src/background/domainKeys.ts` | pure `www.` matching (create) |
| `packages/extension/src/background/tabPause.ts` | pause storage in `storage.session` (create) |
| `packages/extension/src/background/index.ts` | wire new handlers, refresh broadcast (modify) |
| `packages/extension/src/protocol.ts` | new message types (modify) |
| `packages/extension/src/ProtocolClient.ts` | new client methods, `clearCache()` (modify) |
| `packages/extension/src/contentScript/index.ts` | `refresh` listener, `pageStarted` (modify) |
| `packages/extension/src/manifest.ts` | CSP without fonts; test-only `host_permissions` (modify) |
| `packages/extension/options.html`, `popup.html` | drop Google Fonts links (modify) |
| `packages/extension/tests/extensionPages.ts` | helpers: background, extension id, open options/popup (create) |
| `packages/extension/tests/options.spec.ts` | options tests (create) |
| `packages/extension/tests/popup.spec.ts` | popup + pause + www tests (create) |
| `packages/extension/tests/pages/iframe_textarea.html` | page embedding `simple_textarea.html` in an iframe (create) |
| `packages/extension/unit/domainKeys.test.ts` | unit tests for `www.` matching (create) |
| `Makefile`, `biome.json`, `packages/extension/scripts/icon.py`, `CHANGES.md` | build wiring, lint scope, icon outputs, changelog (modify) |

---

### Task 1: Set up shadcn-svelte, theme, and remove Google Fonts

**Files:**
- Create: `packages/extension/components.json`, `packages/extension/src/lib/utils.ts`, `packages/extension/src/lib/components/ui/{button,card,input,label,switch,select,textarea,alert,kbd,separator}/`
- Modify: `packages/extension/vite.config.ts`, `packages/extension/tsconfig.json`, `packages/extension/app.css`, `packages/extension/package.json`, `packages/extension/src/manifest.ts:18-19`, `packages/extension/options.html`, `packages/extension/popup.html`, `biome.json`

**Interfaces:**
- Produces: import paths `$lib/components/ui/<name>/index.js` for Button, Card, Input, Label, Switch, Select, Textarea, Alert, Kbd, Separator; `$lib/utils.js` exporting `cn`. CSS variables from shadcn (`--background`, `--foreground`, `--primary`, `--destructive`, `--muted-foreground`, …) in `app.css`; dark mode via `.dark` class (set by existing `src/theme.ts`).

This task has no behavior test of its own: its deliverable is "the extension builds and all existing gates stay green with shadcn installed". The old pages keep working because `components/components.css` is still imported until Task 6.

- [ ] **Step 1: Add the `$lib` alias**

`packages/extension/vite.config.ts`, in `resolve.alias`:

```ts
		resolve: {
			alias: {
				'@': path.resolve(__dirname, 'src'),
				$lib: path.resolve(__dirname, 'src/lib'),
			},
		},
```

`packages/extension/tsconfig.json`, inside `compilerOptions`:

```json
		"baseUrl": ".",
		"paths": {
			"$lib": ["./src/lib"],
			"$lib/*": ["./src/lib/*"]
		}
```

- [ ] **Step 2: Keep a copy of the old theme block**

The CLI overwrites `app.css`. Save the current file first so Step 4 can restore the old imports:

```bash
cd packages/extension && cp app.css /scratch/oetiker/claude-tmp/app.css.before-shadcn
```

- [ ] **Step 3: Run the CLI init**

```bash
cd packages/extension && pnpm dlx shadcn-svelte@1.7.0 init \
  --base-color neutral --css app.css \
  --lib-alias '$lib' --components-alias '$lib/components' \
  --utils-alias '$lib/utils' --hooks-alias '$lib/hooks' --ui-alias '$lib/components/ui'
```

If the preflight complains that this is not a SvelteKit project or that `svelte.config.js` is missing, re-run with `--skip-preflight`. If it still fails, STOP and report the exact error; do not hand-write `components.json` from memory.

Then add the components:

```bash
cd packages/extension && pnpm dlx shadcn-svelte@1.7.0 add -y button card input label switch select textarea alert kbd separator
pnpm add -D @lucide/svelte
```

- [ ] **Step 4: Make `app.css` keep the old pages working**

Open the new `app.css`. Keep everything the CLI wrote. Make sure these lines exist at the top, in this order (the second one is temporary and is removed in Task 6):

```css
@import "tailwindcss";
@import "components/components.css";
```

Replace whatever `@custom-variant dark` line the CLI wrote with the one `theme.ts` needs (it toggles a `.dark` class on `<html>`):

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Do NOT bring back the honey-bronze / accent / cream `@theme` palettes or the `--font-sans: "Atkinson Hyperlegible"` / `--font-serif: Domine` lines from the saved copy. If the old popup or options page uses a color class from the old palette (`bg-primary`, `text-primary`), it now takes shadcn's `--primary`; that is acceptable until Tasks 2 and 5 replace those pages.

- [ ] **Step 5: Remove Google Fonts**

In `options.html` and `popup.html`, delete both `<link rel="preconnect" …>` lines and both `<link href="https://fonts.googleapis.com/…" rel="stylesheet" />` blocks.

In `src/manifest.ts`, change lines 18-19 to:

```ts
	const styleSrc = ["'self'", "'unsafe-inline'"];
	const fontSrc = ["'self'", 'data:'];
```

- [ ] **Step 6: Exclude vendored components from Biome**

In `biome.json` `files.includes`, add after `"!**/packages/extension/tests/pages/**/*",`:

```json
			"!**/packages/extension/src/lib/components/ui/**/*",
```

- [ ] **Step 7: Run the gates**

From repo root:

```bash
make lint && make check && make test-unit \
 && systemd-run --user --scope -p MemoryMax=6G -- make test-chromium \
 && systemd-run --user --scope -p MemoryMax=6G -- make test-firefox
```

Expected: all pass, same counts as before (unit 10, chromium 15, firefox 12 passed + 3 skipped). `make lint` must not report files under `src/lib/components/ui`. If `make lint` reports `src/lib/utils.ts` formatting, run `pnpm exec biome format --write packages/extension/src/lib/utils.ts` from repo root.

Also confirm no Google Fonts reference remains:

```bash
grep -rn "fonts.g" packages/extension/*.html packages/extension/src packages/extension/app.css
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git status --short && git log --oneline -3
git add biome.json packages/extension/components.json packages/extension/app.css \
  packages/extension/vite.config.ts packages/extension/tsconfig.json \
  packages/extension/package.json packages/extension/src/lib \
  packages/extension/src/manifest.ts packages/extension/options.html \
  packages/extension/popup.html pnpm-lock.yaml
git commit -m "Set up shadcn-svelte and stop loading Google Fonts

The options page and popup will be rebuilt with stock shadcn-svelte
components, vendored by its CLI into src/lib/components/ui (excluded
from Biome so later CLI updates stay clean diffs). The pages no longer
load Atkinson Hyperlegible, Domine and JetBrains Mono from Google, and
the CSP no longer allows those origins.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rebuild the options page, with tests

**Files:**
- Create: `packages/extension/src/components/PageHeader.svelte`, `packages/extension/src/options/HotkeyRecorder.svelte`, `packages/extension/tests/extensionPages.ts`, `packages/extension/tests/options.spec.ts`
- Modify: `packages/extension/src/options/Options.svelte` (full rewrite), `packages/extension/src/manifest.ts` (test-only host permission), `Makefile:37-39` (`test-chromium`), `CHANGES.md`

**Interfaces:**
- Consumes: Task 1 component imports; existing `ProtocolClient` methods `getServerSettings`, `setServerSettings`, `testServer`, `getDisabledRules`, `setDisabledRules`, `getDelay`, `setDelay`, `getDefaultEnabled`, `setDefaultEnabled`, `getActivationKey`, `setActivationKey`, `getHotkey`, `setHotkey`, `getUserDictionary`, `setUserDictionary`, `clearIgnoredLints`, `getEnabledDomains`.
- Produces:
  - `PageHeader.svelte` with prop `subtitle?: string`.
  - `tests/extensionPages.ts` exporting:
    - `getBackground(context: BrowserContext): Promise<Worker>`
    - `extensionId(context: BrowserContext): Promise<string>`
    - `storageGet(context: BrowserContext, key: string): Promise<unknown>`
    - `storageSet(context: BrowserContext, items: Record<string, unknown>): Promise<void>`
    - `openOptions(context: BrowserContext): Promise<Page>`
    - `MOCK_SERVER_URL = 'http://127.0.0.1:18082'`
  - Manifest: when `process.env.INKLING_TEST_BUILD === '1'`, `host_permissions: ['http://127.0.0.1/*']`.

- [ ] **Step 1: Test helpers**

Create `packages/extension/tests/extensionPages.ts`:

```ts
import type { BrowserContext, Page, Worker } from '@playwright/test';

/** The mock LanguageTool server started by playwright.config.ts. Never LT_TEST_SERVER here. */
export const MOCK_SERVER_URL = 'http://127.0.0.1:18082';

export async function getBackground(context: BrowserContext): Promise<Worker> {
	return (
		context.serviceWorkers()[0] ??
		(await context.waitForEvent('serviceworker', { timeout: 90000 }))
	);
}

export async function extensionId(context: BrowserContext): Promise<string> {
	const background = await getBackground(context);
	return new URL(background.url()).host;
}

export async function storageGet(context: BrowserContext, key: string): Promise<unknown> {
	const background = await getBackground(context);
	return background.evaluate(async (key) => (await chrome.storage.local.get(key))[key], key);
}

export async function storageSet(
	context: BrowserContext,
	items: Record<string, unknown>,
): Promise<void> {
	const background = await getBackground(context);
	await background.evaluate(async (items) => {
		await chrome.storage.local.set(items);
	}, items);
}

export async function openOptions(context: BrowserContext): Promise<Page> {
	const page = await context.newPage();
	await page.goto(`chrome-extension://${await extensionId(context)}/options.html`);
	return page;
}
```

- [ ] **Step 2: Write the failing options tests**

Create `packages/extension/tests/options.spec.ts`:

```ts
import {
	extensionId,
	MOCK_SERVER_URL,
	openOptions,
	storageGet,
	storageSet,
} from './extensionPages';
import { expect, test } from './fixtures';

test.skip(({ browserName }) => browserName !== 'chromium', 'Playwright cannot open Firefox extension pages');

test('Save and Test with the mock server shows the success message', async ({ context }) => {
	const page = await openOptions(context);
	await page.getByLabel('Server URL').fill(MOCK_SERVER_URL);
	await page.getByRole('button', { name: 'Save and Test' }).click();
	await expect(page.getByRole('alert')).toContainText('Connected: mock LanguageTool 0.0');
	expect(await storageGet(context, 'serverSettings')).toMatchObject({ serverUrl: MOCK_SERVER_URL });
});

test('An invalid server URL shows an error and saves nothing', async ({ context }) => {
	const page = await openOptions(context);
	await page.getByLabel('Server URL').fill('ftp://x');
	await page.getByRole('button', { name: 'Save and Test' }).click();
	await expect(page.getByRole('alert')).toContainText('Enter a URL that starts with https:// or http://.');
	expect(await storageGet(context, 'serverSettings')).toBeUndefined();
});

test('Fresh profile shows defaults', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page.getByLabel('Delay')).toHaveValue('500');
	await expect(page.getByRole('switch', { name: 'Enable on new sites' })).not.toBeChecked();
	await expect(page.getByLabel('User dictionary')).toHaveValue('');
	await expect(page.getByLabel('Server URL')).not.toHaveValue(/undefined/);
});

test('Settings survive a reload', async ({ context }) => {
	const page = await openOptions(context);
	await page.getByLabel('Delay').fill('750');
	await page.getByRole('switch', { name: 'Enable on new sites' }).click();
	await page.getByLabel('User dictionary').fill('Inkling\nOetiker');
	await expect.poll(() => storageGet(context, 'delay')).toBe(750);
	await expect.poll(() => storageGet(context, 'userDictionary')).toEqual(['Inkling', 'Oetiker']);

	await page.reload();
	await expect(page.getByLabel('Delay')).toHaveValue('750');
	await expect(page.getByRole('switch', { name: 'Enable on new sites' })).toBeChecked();
	await expect(page.getByLabel('User dictionary')).toHaveValue('Inkling\nOetiker');
});

test('Invalid delay is rejected', async ({ context }) => {
	await storageSet(context, { delay: 650 });
	const page = await openOptions(context);
	const delay = page.getByLabel('Delay');
	await expect(delay).toHaveValue('650');

	for (const bad of ['', '-5']) {
		await delay.fill(bad);
		await expect(delay).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByText('Enter a whole number of milliseconds, 0 or more.')).toBeVisible();
	}
	expect(await storageGet(context, 'delay')).toBe(650);
});

test('Hotkey can be recorded and recording can be cancelled', async ({ context }) => {
	const page = await openOptions(context);
	await page.getByRole('button', { name: 'Change hotkey' }).click();
	await expect(page.getByRole('button', { name: 'Press keys…' })).toBeVisible();
	await page.keyboard.press('Control+Shift+K');
	await expect
		.poll(() => storageGet(context, 'hotkey'))
		.toEqual({ modifiers: ['Ctrl', 'Shift'], key: 'K' });

	await page.getByRole('button', { name: 'Change hotkey' }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Change hotkey' })).toBeVisible();
	await page.keyboard.press('Control+Alt+J');
	expect(await storageGet(context, 'hotkey')).toEqual({ modifiers: ['Ctrl', 'Shift'], key: 'K' });
});

test('Options page shows the logo and version', async ({ context }) => {
	const page = await openOptions(context);
	await expect(page.getByRole('img', { name: 'Inkling logo' })).toBeVisible();
	await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
	expect(await extensionId(context)).toMatch(/^[a-p]{32}$/);
});
```

- [ ] **Step 3: Grant the mock server origin in test builds**

In `src/manifest.ts`, above `export default defineManifest(`:

```ts
/**
 * Test builds (`make test-chromium`) get the loopback origin up front, so the
 * settings page's permission request resolves without a browser dialog that
 * Playwright cannot click. The pattern has no port because the settings page
 * requests `http://127.0.0.1/*`.
 */
const testHostPermissions = process.env.INKLING_TEST_BUILD === '1' ? ['http://127.0.0.1/*'] : [];
```

and inside the manifest object, after `optional_host_permissions`:

```ts
	...(testHostPermissions.length > 0 ? { host_permissions: testHostPermissions } : {}),
```

In the `Makefile` `test-chromium` target, change the build line to:

```make
	cd $(EXT) && INKLING_TEST_BUILD=1 TARGET_BROWSER=chrome pnpm build
```

- [ ] **Step 4: Run the tests to see them fail**

```bash
make deps && cd packages/extension && INKLING_TEST_BUILD=1 TARGET_BROWSER=chrome pnpm build \
 && systemd-run --user --scope -p MemoryMax=6G -- xvfb-run -a pnpm exec playwright test --headed --project=chromium tests/options.spec.ts
```

Expected: FAIL — the old page has no `Label`-linked "Server URL", no switch role, no "Change hotkey" button, no `img` named "Inkling logo". If "Save and Test" opens a permission dialog and the test hangs instead of failing on the locator, STOP: the test-build permission is not working; report it.

- [ ] **Step 5: Shared page header**

Create `packages/extension/src/components/PageHeader.svelte`:

```svelte
<script lang="ts">
import logo from '/logo.svg';

let { subtitle }: { subtitle?: string } = $props();

const manifest = chrome.runtime.getManifest();
</script>

<header class="flex items-center gap-3">
  <img src={logo} alt="Inkling logo" class="size-8" />
  <div class="flex flex-1 flex-col">
    <span class="font-semibold leading-tight">{manifest.name}</span>
    {#if subtitle}
      <span class="text-muted-foreground text-xs">{subtitle}</span>
    {/if}
  </div>
  <span class="text-muted-foreground font-mono text-xs">v{manifest.version}</span>
</header>
```

- [ ] **Step 6: Hotkey recorder**

Create `packages/extension/src/options/HotkeyRecorder.svelte`:

```svelte
<script lang="ts">
import { onDestroy } from 'svelte';
import { Button } from '$lib/components/ui/button/index.js';
import { Kbd } from '$lib/components/ui/kbd/index.js';
import type { Hotkey, Modifier } from '../protocol';

let { hotkey, onchange }: { hotkey: Hotkey; onchange: (hotkey: Hotkey) => void } = $props();

let recording = $state(false);

function stop() {
	recording = false;
	window.removeEventListener('keydown', onKeydown, true);
}

function onKeydown(event: KeyboardEvent) {
	event.preventDefault();
	event.stopPropagation();
	if (event.key === 'Escape') {
		stop();
		return;
	}
	if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
		return;
	}
	const modifiers: Modifier[] = [];
	if (event.ctrlKey) modifiers.push('Ctrl');
	if (event.shiftKey) modifiers.push('Shift');
	if (event.altKey) modifiers.push('Alt');
	if (modifiers.length === 0) {
		return;
	}
	stop();
	onchange({ modifiers, key: event.key });
}

function start() {
	recording = true;
	window.addEventListener('keydown', onKeydown, true);
}

onDestroy(stop);
</script>

<div class="flex items-center gap-2">
  <span class="flex gap-1" aria-label="Current hotkey">
    {#each [...hotkey.modifiers, hotkey.key] as part}
      <Kbd>{part}</Kbd>
    {/each}
  </span>
  <Button variant="outline" size="sm" onclick={recording ? stop : start}>
    {recording ? 'Press keys…' : 'Change hotkey'}
  </Button>
</div>
```

Note: with Shift held, `event.key` for K is `'K'`; the test expects `'K'`.

- [ ] **Step 7: Rewrite the options page**

Replace `packages/extension/src/options/Options.svelte` with:

```svelte
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

let serverUrl = $state('');
let preferredVariants = $state('');
let serverStatus: { ok: boolean; message: string } | null = $state(null);
let serverBusy = $state(false);

let loaded = $state(false);
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
]).then(([server, enabled, delay, key, hk, dict, rules]) => {
	serverUrl = server.serverUrl;
	preferredVariants = server.preferredVariants;
	defaultEnabled = enabled;
	delayText = String(delay);
	activationKey = key;
	hotkey = { modifiers: [...hk.modifiers], key: hk.key };
	userDict = listToString(dict.toSorted());
	disabledRules = listToString(rules);
	loaded = true;
});

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
	} finally {
		serverBusy = false;
	}
}

function onDelayInput(raw: string) {
	delayText = raw;
	const value = raw.trim();
	const ok = /^\d+$/.test(value);
	delayError = !ok;
	if (ok) {
		ProtocolClient.setDelay(Number(value));
	}
}

function onDefaultEnabledChange(checked: boolean) {
	defaultEnabled = checked;
	ProtocolClient.setDefaultEnabled(checked);
}

function onActivationKeyChange(value: string) {
	activationKey = value as ActivationKey;
	ProtocolClient.setActivationKey(activationKey);
}

function onHotkeyChange(next: Hotkey) {
	hotkey = next;
	ProtocolClient.setHotkey(next);
}

$effect(() => {
	if (loaded) {
		ProtocolClient.setUserDictionary(stringToList(userDict));
	}
});

$effect(() => {
	if (loaded) {
		ProtocolClient.setDisabledRules(stringToList(disabledRules));
	}
});

async function clearIgnored() {
	await ProtocolClient.clearIgnoredLints();
	ignoredCleared = true;
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
    <Label for={id}>{label}</Label>
    <p class="text-muted-foreground text-sm">{help}</p>
  </div>
{/snippet}

<main class="bg-background text-foreground min-h-screen px-4 py-10">
  <div class="mx-auto flex max-w-2xl flex-col gap-6">
    <PageHeader subtitle="Settings" />

    <Card.Root>
      <Card.Header><Card.Title>Server</Card.Title></Card.Header>
      <Card.Content class="flex flex-col gap-6">
        <div class="grid gap-2 sm:grid-cols-[1fr_18rem] sm:items-center">
          {@render row('server-url', 'Server URL', 'For example https://lt.example.com or http://localhost:8081. Leave empty to turn checking off.')}
          <Input id="server-url" placeholder="https://lt.example.com" bind:value={serverUrl} />
        </div>
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
            <Input id="delay" type="text" inputmode="numeric" value={delayText} oninput={(e) => onDelayInput(e.currentTarget.value)} aria-invalid={delayError} aria-describedby="delay-error" />
            {#if delayError}
              <p id="delay-error" class="text-destructive text-sm">Enter a whole number of milliseconds, 0 or more.</p>
            {/if}
          </div>
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('activation-key', 'Activation key', 'Show highlights only after you press this key twice.')}
          <Select.Root type="single" value={activationKey} onValueChange={onActivationKeyChange}>
            <Select.Trigger id="activation-key" class="w-44">{activationKeyLabels[activationKey]}</Select.Trigger>
            <Select.Content>
              {#each Object.values(ActivationKey) as key}
                <Select.Item value={key}>{activationKeyLabels[key]}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="flex items-center justify-between gap-4">
          {@render row('hotkey', 'Apply-suggestion hotkey', 'Applies the first suggestion to the last marked word.')}
          <HotkeyRecorder {hotkey} onchange={onHotkeyChange} />
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
```

Notes for the implementer:
- `Label for=` must match each control's `id`, so the test's `getByLabel` and `getByRole('switch', { name })` work. If the bits-ui `Switch` does not take its accessible name from `<Label for>`, add `aria-label="Enable on new sites"` to it.
- The `role="alert"` used by the tests must come from shadcn's `Alert.Root`. If it does not render `role="alert"`, add `role="alert"` to `Alert.Root`.
- Check the exact Select API with the shadcn-svelte MCP (`shadcn-svelte-get("select", type: "component")`) if `type="single"` / `onValueChange` do not type-check.
- `ActivationKey` values: verify `Object.values(ActivationKey)` gives `['off', 'shift', 'control']` in `src/protocol.ts`; keep the order Double Shift, Double Control, Off if it differs (list them explicitly then).
- The old `data-testid` attributes are gone; no test used them (checked: `grep -rn data-testid packages/extension/tests` gives nothing).

- [ ] **Step 8: Run the options tests**

Same command as Step 4. Expected: 7 tests × 3 repeats PASS.

- [ ] **Step 9: CHANGES.md entry**

Add at the top of the unreleased entries in `CHANGES.md`:

```markdown
- The settings page has a new, cleaner look. The "Delay" field now refuses an empty or negative value with a message instead of silently saving 0, and pressing Escape while setting the apply-suggestion hotkey keeps the old one.
- The settings page and the popup no longer load fonts from Google.
```

- [ ] **Step 10: Gates and commit**

```bash
make lint && make check && make test-unit \
 && systemd-run --user --scope -p MemoryMax=6G -- make test-chromium \
 && systemd-run --user --scope -p MemoryMax=6G -- make test-firefox
git status --short && git log --oneline -3
git add Makefile CHANGES.md packages/extension/src/manifest.ts \
  packages/extension/src/components/PageHeader.svelte \
  packages/extension/src/options/Options.svelte packages/extension/src/options/HotkeyRecorder.svelte \
  packages/extension/tests/extensionPages.ts packages/extension/tests/options.spec.ts
git commit -m "Rebuild the settings page with shadcn-svelte

Stock Card/Input/Switch/Select/Textarea/Alert/Kbd components, one
labelled row per setting. Delay input is validated (whole number >= 0)
instead of being coerced to 0 by the background. The hotkey recorder
cancels on Escape and always removes its keydown listener.

Test builds (INKLING_TEST_BUILD=1, set by make test-chromium) grant
http://127.0.0.1/* up front so chrome.permissions.request resolves
without a dialog Playwright cannot click; release builds are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected test counts: chromium 15 + 21 = 36; firefox 12 passed + (3 + 21) skipped.

---

### Task 3: Fix the per-site switch on `www.` hosts and refresh open pages

**Files:**
- Create: `packages/extension/src/background/domainKeys.ts`, `packages/extension/unit/domainKeys.test.ts`, `packages/extension/tests/popup.spec.ts`
- Modify: `packages/extension/src/background/index.ts` (`getDomainLookupCandidates`, `getStoredDomainStatus`, `setDomainEnable`, `handleSetDomainStatus`, `handleSetDefaultStatus`, add `refreshTabs`), `packages/extension/src/protocol.ts`, `packages/extension/src/ProtocolClient.ts`, `packages/extension/src/contentScript/index.ts`, `CHANGES.md`

**Interfaces:**
- Produces:
  - `domainKeys.ts`: `export function domainLookupCandidates(hostname: string): string[]` and `export function domainWriteTarget(hostname: string, storedHosts: ReadonlySet<string>): string`.
  - `protocol.ts`: `export type RefreshMessage = { kind: 'refresh' };`
  - `ProtocolClient.clearCache(): void`.
  - Background: `async function refreshTabs(tabIds?: number[]): Promise<void>` (all tabs when omitted); `setDomainEnable(...)` now returns `Promise<boolean>` = whether storage changed.

- [ ] **Step 1: Write the failing unit test**

Create `packages/extension/unit/domainKeys.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { domainLookupCandidates, domainWriteTarget } from '../src/background/domainKeys.ts';

describe('domainLookupCandidates', () => {
	it('tries the exact host first, then without www.', () => {
		assert.deepEqual(domainLookupCandidates('www.reddit.com'), ['www.reddit.com', 'reddit.com']);
	});
	it('has one candidate for a host without www.', () => {
		assert.deepEqual(domainLookupCandidates('reddit.com'), ['reddit.com']);
		assert.deepEqual(domainLookupCandidates('old.reddit.com'), ['old.reddit.com']);
	});
});

describe('domainWriteTarget', () => {
	it('writes the www. key when that is what the lookup finds', () => {
		assert.equal(domainWriteTarget('www.reddit.com', new Set(['www.reddit.com'])), 'www.reddit.com');
	});
	it('writes the bare key when only that is stored', () => {
		assert.equal(domainWriteTarget('www.localhost', new Set(['localhost'])), 'localhost');
	});
	it('prefers the exact host when both are stored', () => {
		assert.equal(
			domainWriteTarget('www.reddit.com', new Set(['www.reddit.com', 'reddit.com'])),
			'www.reddit.com',
		);
	});
	it('writes the exact host when nothing is stored', () => {
		assert.equal(domainWriteTarget('www.example.com', new Set()), 'www.example.com');
		assert.equal(domainWriteTarget('sub.example.com', new Set()), 'sub.example.com');
	});
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd packages/extension && pnpm test:unit
```

Expected: FAIL, cannot find module `../src/background/domainKeys.ts`.

- [ ] **Step 3: Implement `domainKeys.ts`**

```ts
/**
 * Which storage keys decide whether checking is on for a host. Kept free of the
 * `chrome` API so unit tests can load it.
 */

/** Hosts to look up, most specific first: `www.x` falls back to `x`. */
export function domainLookupCandidates(hostname: string): string[] {
	const withoutWww = hostname.replace(/^www\./, '');
	return withoutWww === hostname ? [hostname] : [hostname, withoutWww];
}

/**
 * The host whose key a new status must be written to, so that the next lookup
 * for `hostname` finds the written value: the first stored candidate, or the
 * exact host when none is stored.
 */
export function domainWriteTarget(hostname: string, storedHosts: ReadonlySet<string>): string {
	return domainLookupCandidates(hostname).find((c) => storedHosts.has(c)) ?? hostname;
}
```

Run `pnpm test:unit`. Expected: PASS (10 old + 6 new).

- [ ] **Step 4: Use it in the background**

In `src/background/index.ts`:

1. Add `import { domainLookupCandidates, domainWriteTarget } from './domainKeys';` and `type RefreshMessage` to the protocol import.
2. Delete the local `getDomainLookupCandidates` function and replace its uses with `domainLookupCandidates`.
3. Replace `setDomainEnable` with:

```ts
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
```

4. Add the broadcast:

```ts
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
```

5. Change the two handlers:

```ts
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
```

`enableDefaultDomains()` keeps calling `setDomainEnable(item, true)`; it ignores the return value and must not broadcast.

- [ ] **Step 5: Protocol, client, content script**

`src/protocol.ts`, after `OpenOptionsRequest`:

```ts
/** Sent by the background to content scripts when a setting changed. */
export type RefreshMessage = {
	kind: 'refresh';
};
```

`src/ProtocolClient.ts`, add:

```ts
	/** Forget cached results, so the next check asks the background again. */
	public static clearCache(): void {
		this.lintCache.clear();
	}
```

`src/contentScript/index.ts`, after the `const fw = new LintFramework(...)` block:

```ts
// The background asks for this after a site, default or pause setting changed.
// LintFramework re-checks every second; with the cache gone it asks the background again.
chrome.runtime.onMessage.addListener((message: { kind?: string }) => {
	if (message?.kind === 'refresh') {
		ProtocolClient.clearCache();
	}
});
```

- [ ] **Step 6: Write the failing browser test for www. hosts and refresh**

The page server listens on 127.0.0.1:18081; Chromium resolves any `*.localhost` name to loopback, so `http://www.localhost:18081/` reaches it. Create `packages/extension/tests/popup.spec.ts` with this first test (Task 5 adds the popup UI tests to the same file; this test drives the background protocol directly, so it does not depend on the popup UI):

```ts
import type { BrowserContext, Page } from '@playwright/test';
import { getBackground, MOCK_SERVER_URL, storageGet, storageSet } from './extensionPages';
import { expect, test } from './fixtures';

test.skip(({ browserName }) => browserName !== 'chromium', 'Playwright cannot open Firefox extension pages');

const PAGE = 'simple_textarea.html';

async function markedPage(context: BrowserContext, url: string): Promise<Page> {
	const page = await context.newPage();
	await page.goto(url);
	await page.locator('textarea').fill('Das ist ein Tset.');
	await expect(page.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });
	return page;
}

// Protocol messages are sent from an extension page, not from the service worker:
// chrome.runtime.sendMessage in the worker does not reach the worker's own listener.
test('Site switch works on a www. host and takes effect at once', async ({ context }) => {
	await storageSet(context, {
		serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' },
		'domainStatus www.localhost': true,
	});
	const page = await markedPage(context, `http://www.localhost:18081/${PAGE}`);

	const ext = await context.newPage();
	await ext.goto(`chrome-extension://${new URL((await getBackground(context)).url()).host}/options.html`);
	await ext.evaluate(() =>
		chrome.runtime.sendMessage({
			kind: 'setDomainStatus',
			domain: 'www.localhost',
			enabled: false,
			overrideValue: true,
		}),
	);
	expect(await storageGet(context, 'domainStatus www.localhost')).toBe(false);

	await page.bringToFront();
	await expect(page.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
});
```

- [ ] **Step 7: Run it**

```bash
cd packages/extension && INKLING_TEST_BUILD=1 TARGET_BROWSER=chrome pnpm build \
 && systemd-run --user --scope -p MemoryMax=6G -- xvfb-run -a pnpm exec playwright test --headed --project=chromium tests/popup.spec.ts
```

Expected: PASS with Steps 3-5 in place. To prove the test catches the old bug, temporarily change the `domain` in the test to `'localhost'` (what the old popup sent) and run once: it must FAIL (the `www.localhost: true` key wins, marks stay). Revert the change.

- [ ] **Step 8: CHANGES.md entry**

```markdown
- Turning a site off in the popup now also works on sites whose address starts with "www." (such as www.reddit.com), and the marks disappear within a second instead of after up to a minute.
```

- [ ] **Step 9: Gates and commit**

Run all gates (see Global Constraints). Expected: unit 16; chromium 36 + 3 = 39.

```bash
git status --short && git log --oneline -3
git add CHANGES.md packages/extension/src/background/domainKeys.ts packages/extension/src/background/index.ts \
  packages/extension/src/protocol.ts packages/extension/src/ProtocolClient.ts \
  packages/extension/src/contentScript/index.ts packages/extension/unit/domainKeys.test.ts \
  packages/extension/tests/popup.spec.ts
git commit -m "Make the site switch work on www. hosts and apply at once

The popup stripped www. before reading and writing the site status,
while the default list stores www.reddit.com and the lookup tries the
exact host first, so on such sites the switch showed the wrong state
and could not turn checking off. Matching now lives in domainKeys.ts:
writes go to the key the lookup will find first, else the exact host.

Content scripts cache results for 60 s, so a changed setting showed up
to a minute late. The background now sends 'refresh' to all tabs when
a site or default status really changed; the content script clears its
cache and the 1 s re-check picks up the new state.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Per-tab pause in the background

**Files:**
- Create: `packages/extension/src/background/tabPause.ts`, `packages/extension/tests/pages/iframe_textarea.html`
- Modify: `packages/extension/src/background/index.ts`, `packages/extension/src/protocol.ts`, `packages/extension/src/ProtocolClient.ts`, `packages/extension/src/contentScript/index.ts`, `packages/extension/tests/popup.spec.ts`

**Interfaces:**
- Consumes: `refreshTabs(tabIds?: number[])` from Task 3.
- Produces:
  - `tabPause.ts`: `isTabPaused(tabId: number | undefined): Promise<boolean>`, `setTabPaused(tabId: number, paused: boolean): Promise<boolean>` (returns whether it changed), `clearTabPause(tabId: number): Promise<void>`.
  - Protocol: `GetTabPausedRequest { kind: 'getTabPaused'; tabId: number }`, `GetTabPausedResponse { kind: 'getTabPaused'; paused: boolean }`, `SetTabPausedRequest { kind: 'setTabPaused'; tabId: number; paused: boolean }`, `PageStartedRequest { kind: 'pageStarted' }`.
  - `ProtocolClient.getTabPaused(tabId: number): Promise<boolean>`, `ProtocolClient.setTabPaused(tabId: number, paused: boolean): Promise<void>`, `ProtocolClient.pageStarted(): Promise<void>`.

- [ ] **Step 1: Iframe test page**

Create `packages/extension/tests/pages/iframe_textarea.html`:

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<title>Textarea in an iframe</title>
	</head>
	<body>
		<iframe src="simple_textarea.html" width="600" height="300" title="editor"></iframe>
	</body>
</html>
```

- [ ] **Step 2: Write the failing pause tests**

Append to `packages/extension/tests/popup.spec.ts`:

```ts
/** Sends a protocol message from an extension page (the worker cannot message itself). */
async function sendFromExtension(context: BrowserContext, message: unknown): Promise<unknown> {
	const background = await getBackground(context);
	const ext = await context.newPage();
	await ext.goto(`chrome-extension://${new URL(background.url()).host}/options.html`);
	const result = await ext.evaluate((m) => chrome.runtime.sendMessage(m), message);
	await ext.close();
	return result;
}

async function tabIdOf(context: BrowserContext, urlPart: string): Promise<number> {
	const background = await getBackground(context);
	return background.evaluate(async (urlPart) => {
		const tabs = await chrome.tabs.query({});
		const tab = tabs.find((t) => t.url?.includes(urlPart));
		if (tab?.id == null) throw new Error(`no tab with ${urlPart}`);
		return tab.id;
	}, urlPart);
}

async function setupServer(context: BrowserContext) {
	await storageSet(context, { serverSettings: { serverUrl: MOCK_SERVER_URL, preferredVariants: '' } });
}

test('Pausing one tab removes its marks and leaves the other tab alone', async ({ context }) => {
	await setupServer(context);
	const a = await markedPage(context, `http://localhost:18081/${PAGE}?tab=a`);
	const b = await markedPage(context, `http://localhost:18081/${PAGE}?tab=b`);
	const idA = await tabIdOf(context, '?tab=a');

	await sendFromExtension(context, { kind: 'setTabPaused', tabId: idA, paused: true });
	expect(await sendFromExtension(context, { kind: 'getTabPaused', tabId: idA })).toMatchObject({
		paused: true,
	});

	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
	await b.bringToFront();
	await expect(b.locator('#inkling-highlight').first()).toBeVisible();

	await sendFromExtension(context, { kind: 'setTabPaused', tabId: idA, paused: false });
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight').first()).toBeVisible({ timeout: 5000 });
});

test('A pause survives pushState and ends on reload', async ({ context }) => {
	await setupServer(context);
	const a = await markedPage(context, `http://localhost:18081/${PAGE}?tab=a`);
	const idA = await tabIdOf(context, '?tab=a');
	await sendFromExtension(context, { kind: 'setTabPaused', tabId: idA, paused: true });
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });

	await a.evaluate(() => history.pushState({}, '', '?tab=a&spa=1'));
	await a.waitForTimeout(1500);
	expect(await sendFromExtension(context, { kind: 'getTabPaused', tabId: idA })).toMatchObject({
		paused: true,
	});

	await a.reload();
	await expect
		.poll(async () => sendFromExtension(context, { kind: 'getTabPaused', tabId: idA }))
		.toMatchObject({ paused: false });
	await a.locator('textarea').fill('Das ist ein Tset.');
	await expect(a.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });
});

test('A pause covers frames inside the tab', async ({ context }) => {
	await setupServer(context);
	const page = await context.newPage();
	await page.goto('http://localhost:18081/iframe_textarea.html');
	const frame = page.frameLocator('iframe[title="editor"]');
	await frame.locator('textarea').fill('Das ist ein Tset.');
	await expect(frame.locator('#inkling-highlight').first()).toBeVisible({ timeout: 30000 });

	const id = await tabIdOf(context, 'iframe_textarea.html');
	await sendFromExtension(context, { kind: 'setTabPaused', tabId: id, paused: true });
	await page.bringToFront();
	await expect(frame.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
});
```

Note: if the highlight for a textarea inside an iframe is rendered in the top document rather than the frame, change `frame.locator('#inkling-highlight')` to `page.locator('#inkling-highlight')` in both lines — check where it appears with the pause code absent first (Step 3).

- [ ] **Step 3: Run them to see them fail**

Build and run `tests/popup.spec.ts` (command from Task 3 Step 7). Expected: the three new tests FAIL (the background answers `undefined` to the unknown `setTabPaused` kind; marks stay). The www test still passes.

- [ ] **Step 4: Implement `tabPause.ts`**

```ts
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
```

- [ ] **Step 5: Protocol and client**

`src/protocol.ts`: add `GetTabPausedRequest | SetTabPausedRequest | PageStartedRequest` to `Request`, `GetTabPausedResponse` to `Response`, and:

```ts
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

/** Sent once by the top frame's content script when a new document starts. */
export type PageStartedRequest = {
	kind: 'pageStarted';
};
```

`src/ProtocolClient.ts`:

```ts
	public static async getTabPaused(tabId: number): Promise<boolean> {
		return (await chrome.runtime.sendMessage({ kind: 'getTabPaused', tabId })).paused;
	}

	public static async setTabPaused(tabId: number, paused: boolean): Promise<void> {
		await chrome.runtime.sendMessage({ kind: 'setTabPaused', tabId, paused });
	}

	public static async pageStarted(): Promise<void> {
		await chrome.runtime.sendMessage({ kind: 'pageStarted' });
	}
```

- [ ] **Step 6: Background wiring**

In `src/background/index.ts`:

```ts
import { clearTabPause, isTabPaused, setTabPaused } from './tabPause';
```

In `handleRequest`, add cases:

```ts
		case 'getTabPaused':
			return handleGetTabPaused(message);
		case 'setTabPaused':
			return handleSetTabPaused(message);
		case 'pageStarted':
			return handlePageStarted(sender);
```

Handlers:

```ts
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
async function handlePageStarted(sender?: chrome.runtime.MessageSender): Promise<UnitResponse> {
	if (sender?.tab?.id != null && sender.frameId === 0) {
		await clearTabPause(sender.tab.id);
	}
	return createUnitResponse();
}
```

At the start of `shouldLintForRequest`:

```ts
	if (await isTabPaused(sender?.tab?.id)) {
		return false;
	}
```

Near the `chrome.runtime.onMessage.addListener` call:

```ts
chrome.tabs.onRemoved.addListener((tabId) => {
	void clearTabPause(tabId);
});
```

Add the new types to the protocol import list.

- [ ] **Step 7: Content script start message**

`src/contentScript/index.ts`, after the `refresh` listener from Task 3:

```ts
// A new document in this tab ends a pause the user set for it.
if (window === window.top) {
	void ProtocolClient.pageStarted();
}
```

- [ ] **Step 8: Run the tests**

Build and run `tests/popup.spec.ts`. Expected: 4 tests × 3 PASS.

- [ ] **Step 9: Gates and commit**

All gates. Expected chromium: 39 + 9 = 48. No CHANGES.md entry yet (the user cannot reach the pause until Task 5).

```bash
git status --short && git log --oneline -3
git add packages/extension/src/background/tabPause.ts packages/extension/src/background/index.ts \
  packages/extension/src/protocol.ts packages/extension/src/ProtocolClient.ts \
  packages/extension/src/contentScript/index.ts packages/extension/tests/popup.spec.ts \
  packages/extension/tests/pages/iframe_textarea.html
git commit -m "Add a per-tab pause to the background

Paused tabs are kept as one storage.session key per tab; check requests
from any frame of a paused tab get no results. The pause ends when the
tab closes or when the top frame's content script starts on a new
document (reload or navigation). History-API navigation does not
restart the content script, so single-page apps stay paused. This
avoids the webNavigation permission, which in Firefox adds an install
warning and holds back updates until users approve it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rebuild the popup

**Files:**
- Create: `packages/extension/src/popup/currentTab.ts`, `packages/extension/src/popup/SiteControls.svelte`
- Modify: `packages/extension/src/popup/Popup.svelte` (rewrite)
- Delete: `packages/extension/src/popup/Main.svelte`
- Test: `packages/extension/tests/popup.spec.ts`
- Modify: `CHANGES.md`

**Interfaces:**
- Consumes: `PageHeader.svelte` (Task 2); `ProtocolClient.getDomainEnabled(domain)`, `setDomainEnabled(domain, enabled)`, `getTabPaused(tabId)`, `setTabPaused(tabId, paused)`, `getServerSettings()`, `openOptions()`.
- Produces: `currentTab.ts`: `export type PopupTab = { id: number; url: string | undefined }`, `export async function currentTab(): Promise<PopupTab | undefined>`, `export function checkableHost(url: string | undefined): string | undefined`.

- [ ] **Step 1: Write the failing popup tests**

Append to `packages/extension/tests/popup.spec.ts`:

```ts
async function openPopupFor(context: BrowserContext, tabId: number): Promise<Page> {
	const background = await getBackground(context);
	const popup = await context.newPage();
	await popup.goto(`chrome-extension://${new URL(background.url()).host}/popup.html?tab=${tabId}`);
	return popup;
}

test('Popup turns a site off and on', async ({ context }) => {
	await setupServer(context);
	const a = await markedPage(context, `http://localhost:18081/${PAGE}?tab=a`);
	const popup = await openPopupFor(context, await tabIdOf(context, '?tab=a'));

	await expect(popup.getByText('localhost', { exact: true })).toBeVisible();
	const site = popup.getByRole('switch', { name: 'Check this site' });
	await expect(site).toBeChecked();
	await expect(popup.getByText('Checking is on')).toBeVisible();

	await site.click();
	await expect(popup.getByText('Off for this site')).toBeVisible();
	await expect(popup.getByRole('button', { name: 'Pause in this tab' })).toHaveCount(0);
	expect(await storageGet(context, 'domainStatus localhost')).toBe(false);
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });
});

test('Popup pauses and resumes the tab; turning the site off ends the pause', async ({ context }) => {
	await setupServer(context);
	const a = await markedPage(context, `http://localhost:18081/${PAGE}?tab=a`);
	const idA = await tabIdOf(context, '?tab=a');
	const popup = await openPopupFor(context, idA);

	await popup.getByRole('button', { name: 'Pause in this tab' }).click();
	await expect(popup.getByText('Paused in this tab')).toBeVisible();
	await a.bringToFront();
	await expect(a.locator('#inkling-highlight')).toHaveCount(0, { timeout: 5000 });

	await popup.bringToFront();
	await popup.getByRole('button', { name: 'Resume in this tab' }).click();
	await expect(popup.getByText('Checking is on')).toBeVisible();

	await popup.getByRole('button', { name: 'Pause in this tab' }).click();
	const site = popup.getByRole('switch', { name: 'Check this site' });
	await site.click();
	await site.click();
	expect(await sendFromExtension(context, { kind: 'getTabPaused', tabId: idA })).toMatchObject({
		paused: false,
	});
	await expect(popup.getByText('Checking is on')).toBeVisible();
});

test('Popup shows a hint when no server is set', async ({ context }) => {
	const a = await context.newPage();
	await a.goto(`http://localhost:18081/${PAGE}?tab=a`);
	const popup = await openPopupFor(context, await tabIdOf(context, '?tab=a'));
	await expect(popup.getByRole('alert')).toContainText('No LanguageTool server is set');
	await expect(popup.getByRole('switch', { name: 'Check this site' })).toHaveCount(0);
});

test('Popup cannot act on about:blank', async ({ context }) => {
	await setupServer(context);
	const blank = await context.newPage();
	await blank.goto('about:blank');
	const background = await getBackground(context);
	const id = await background.evaluate(async () => {
		const tabs = await chrome.tabs.query({});
		return tabs.find((t) => t.url === 'about:blank')!.id!;
	});
	const popup = await openPopupFor(context, id);
	await expect(popup.getByText('Inkling cannot check this page')).toBeVisible();
	await expect(popup.getByRole('switch', { name: 'Check this site' })).toBeDisabled();
});

test('Popup shows the logo and opens the settings', async ({ context }) => {
	await setupServer(context);
	const a = await context.newPage();
	await a.goto(`http://localhost:18081/${PAGE}?tab=a`);
	const popup = await openPopupFor(context, await tabIdOf(context, '?tab=a'));
	await expect(popup.getByRole('img', { name: 'Inkling logo' })).toBeVisible();
	const optionsPage = context.waitForEvent('page');
	await popup.getByRole('button', { name: 'Settings' }).click();
	expect((await optionsPage).url()).toContain('/options.html');
});
```

Run (Task 3 Step 7 command). Expected: the 5 new tests FAIL (old popup has no labelled switch, no pause button, ignores `?tab=`).

- [ ] **Step 2: `currentTab.ts`**

```ts
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
```

- [ ] **Step 3: `SiteControls.svelte`**

```svelte
<script lang="ts">
import Pause from '@lucide/svelte/icons/pause';
import Play from '@lucide/svelte/icons/play';
import { Button } from '$lib/components/ui/button/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Switch } from '$lib/components/ui/switch/index.js';
import ProtocolClient from '../ProtocolClient';
import { checkableHost, type PopupTab } from './currentTab';

let { tab }: { tab: PopupTab | undefined } = $props();

const host = $derived(checkableHost(tab?.url));
const shownHost = $derived(host?.replace(/^www\./, ''));

let enabled = $state(false);
let paused = $state(false);

$effect(() => {
	if (host != null && tab != null) {
		ProtocolClient.getDomainEnabled(host).then((e) => {
			enabled = e;
		});
		ProtocolClient.getTabPaused(tab.id).then((p) => {
			paused = p;
		});
	}
});

async function onSiteChange(checked: boolean) {
	if (host == null || tab == null) return;
	enabled = checked;
	await ProtocolClient.setDomainEnabled(host, checked);
	if (!checked && paused) {
		paused = false;
		await ProtocolClient.setTabPaused(tab.id, false);
	}
}

async function togglePause() {
	if (tab == null) return;
	paused = !paused;
	await ProtocolClient.setTabPaused(tab.id, paused);
}

const status = $derived(
	!enabled ? 'Off for this site' : paused ? 'Paused in this tab' : 'Checking is on',
);
</script>

{#if host == null}
  <div class="flex items-center justify-between gap-3">
    <p class="text-muted-foreground text-sm">Inkling cannot check this page</p>
    <Switch aria-label="Check this site" disabled checked={false} />
  </div>
{:else}
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col">
        <span class="truncate font-medium" title={host}>{shownHost}</span>
        <Label for="site-switch" class="text-muted-foreground text-xs font-normal">Check this site</Label>
      </div>
      <Switch id="site-switch" aria-label="Check this site" checked={enabled} onCheckedChange={onSiteChange} />
    </div>
    <p class="text-muted-foreground text-sm" aria-live="polite">{status}</p>
    {#if enabled}
      <Button variant="outline" size="sm" onclick={togglePause}>
        {#if paused}<Play />Resume in this tab{:else}<Pause />Pause in this tab{/if}
      </Button>
    {/if}
  </div>
{/if}
```

Note: the test reads the site name with `getByText('localhost', { exact: true })`; the Label text "Check this site" must not contain the host.

- [ ] **Step 4: `Popup.svelte`**

```svelte
<script lang="ts">
import Settings2 from '@lucide/svelte/icons/settings-2';
import * as Alert from '$lib/components/ui/alert/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
import PageHeader from '../components/PageHeader.svelte';
import ProtocolClient from '../ProtocolClient';
import { currentTab, type PopupTab } from './currentTab';
import SiteControls from './SiteControls.svelte';

let tab: PopupTab | undefined = $state();
let tabLoaded = $state(false);
let serverConfigured: boolean | null = $state(null);

currentTab().then((t) => {
	tab = t;
	tabLoaded = true;
});

ProtocolClient.getServerSettings().then((s) => {
	serverConfigured = s.serverUrl.length > 0;
});

function openSettings() {
	ProtocolClient.openOptions();
}
</script>

<main class="bg-background text-foreground flex w-80 flex-col gap-4 p-4">
  <PageHeader />
  <Separator />

  {#if serverConfigured === false}
    <Alert.Root>
      <Alert.Title>No LanguageTool server is set</Alert.Title>
      <Alert.Description>
        <Button variant="link" class="h-auto p-0" onclick={openSettings}>Open the settings</Button> to add one.
      </Alert.Description>
    </Alert.Root>
  {:else if serverConfigured === true && tabLoaded}
    <SiteControls {tab} />
  {/if}

  <Separator />
  <div class="flex justify-end">
    <Button variant="ghost" size="sm" onclick={openSettings}><Settings2 />Settings</Button>
  </div>
</main>
```

Check that `ProtocolClient.openOptions` exists (`grep -n openOptions packages/extension/src/ProtocolClient.ts`); the content script already uses it. If shadcn's `Alert.Root` lacks `role="alert"`, add it (test "hint when no server is set" depends on it).

Delete `src/popup/Main.svelte`:

```bash
git rm packages/extension/src/popup/Main.svelte
```

- [ ] **Step 5: Run the popup tests**

Build and run `tests/popup.spec.ts`. Expected: 9 tests × 3 PASS.

- [ ] **Step 6: Screenshots for the user**

Write a throwaway spec outside the repo (see handoff §4: config with `testDir` in the scratch dir, a `package.json` with `{"type":"module"}`, and a `node_modules` symlink to `packages/extension/node_modules`) that saves screenshots of `options.html` and `popup.html?tab=<id>` with `page.emulateMedia({ colorScheme: 'light' })` and `'dark'` to `/scratch/oetiker/claude-tmp/inkling-shots/`. Show them to the user before committing; apply requested changes.

- [ ] **Step 7: CHANGES.md entry**

```markdown
- The popup has a new look with a "Check this site" switch and a "Pause in this tab" button: a pause stops checking only in the current tab and ends when you reload the tab, open another page in it or close it.
- The popup says "Inkling cannot check this page" on browser pages and extension stores instead of showing an empty site name.
```

- [ ] **Step 8: Gates and commit**

All gates. Expected chromium: 48 + 15 = 63.

```bash
git status --short && git log --oneline -3
git add CHANGES.md packages/extension/src/popup packages/extension/tests/popup.spec.ts
git commit -m "Rebuild the popup with a site switch and a per-tab pause

The popup now sends the full hostname (only the label drops www.),
offers Pause/Resume for the current tab while the site is on, ends the
pause of its own tab when the site is turned off (the background cannot
tell which tab a popup belongs to), and disables the controls on pages
where content scripts cannot run. Tests open popup.html?tab=<id> as a
normal tab; popup.html is not web-accessible.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Delete `packages/components`

**Files:**
- Delete: `packages/components/`
- Modify: `packages/extension/package.json` (drop `"components": "workspace:*"`, drop `flowbite` devDependency), `packages/extension/app.css` (drop `@import "components/components.css";`), `Makefile` (comment line 2, `deps`, `clean`), `packages/extension/scripts/icon.py`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: nothing imports `components` any more after Tasks 2 and 5.

- [ ] **Step 1: Confirm nothing imports it**

```bash
cd /home/oetiker/checkouts/inkling && grep -rn "from 'components'\|components/components.css\|flowbite" packages/extension/src packages/extension/app.css packages/lint-framework/src
```

Expected: only the `app.css` import line. Anything else: STOP and report.

- [ ] **Step 2: Coordinate with the icon session**

`git log --oneline -5 -- packages/components packages/extension/scripts/icon.py`. If there are commits newer than `c517b336`, read them first; if another session edited `icon.py` in the working tree (`git status`), STOP and ask the user.

- [ ] **Step 3: Update `icon.py`**

In `packages/extension/scripts/icon.py`:
- Delete the `COMPONENTS`, `FAVICON_SVG`, `LOGO_SVELTE` constants and the `svelte_file()` function.
- Change the docstring's first lines to: `Writes the extension icon (public/logo.svg). \`make icons\` runs this and renders the PNG sizes from it with Inkscape.`
- Change the `__main__` block to:

```python
if __name__ == '__main__':
	EXTENSION_SVG.write_text(svg_file())
	print(f'wrote {EXTENSION_SVG}')
```

Verify: `python3 packages/extension/scripts/icon.py && git diff --stat packages/extension/public/logo.svg` → `wrote …/public/logo.svg` and no diff to `logo.svg`.

- [ ] **Step 4: Remove the package and its wiring**

```bash
git rm -r -q packages/components
```

`Makefile`:
- line 2: `# the lint-framework package is built first because the extension imports it.`
- `deps`: delete the line `cd packages/components && pnpm build`.
- `clean`: `rm -rf $(EXT)/build $(EXT)/package packages/lint-framework/dist`

`packages/extension/package.json`: remove `"components": "workspace:*"` and `"flowbite": "^3.1.2"`.

`packages/extension/app.css`: remove `@import "components/components.css";`.

Then:

```bash
pnpm install
```

Check: `grep -n "components\|flowbite" pnpm-lock.yaml | grep -v "@sveltejs\|svelte-check" | head` shows no `packages/components` importer and no flowbite.

- [ ] **Step 5: Gates**

All gates. Expected: unit 16, chromium 63, firefox 12 passed + rest skipped — the same counts as after Task 5. Then rebuild for Chrome (`LT_DEFAULT_SERVER_URL=https://lt.oetiker.ch TARGET_BROWSER=chrome pnpm build` in `packages/extension`) and check the release manifest has no `host_permissions`:

```bash
grep -c host_permissions packages/extension/build/manifest.json
```

Expected: `1` (only `optional_host_permissions`). If `2`, the test permission leaked into a release build: STOP.

- [ ] **Step 6: Commit**

```bash
git status --short && git log --oneline -3
git add Makefile packages/extension/package.json packages/extension/app.css \
  packages/extension/scripts/icon.py pnpm-lock.yaml
git commit -m "Remove the components package inherited from Harper

Nothing imports it after the settings page and popup moved to
shadcn-svelte. make deps no longer builds it, and make icons no longer
writes its favicon and Logo.svelte; the extension's logo.svg is the
only output.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm -r packages/components` from Step 4 is already staged.)
