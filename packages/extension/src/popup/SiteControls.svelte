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
// Set once the user acted, so a slow initial read cannot overwrite the choice.
let enabledTouched = false;
let pausedTouched = false;

$effect(() => {
	if (host != null && tab != null) {
		ProtocolClient.getDomainEnabled(host).then((e) => {
			if (!enabledTouched) enabled = e;
		});
		ProtocolClient.getTabPaused(tab.id).then((p) => {
			if (!pausedTouched) paused = p;
		});
	}
});

async function onSiteChange(checked: boolean) {
	if (host == null || tab == null) return;
	const wasEnabled = enabled;
	const wasPaused = paused;
	enabledTouched = true;
	enabled = checked;
	try {
		await ProtocolClient.setDomainEnabled(host, checked);
	} catch {
		enabled = wasEnabled;
		return;
	}
	if (!checked) {
		// Always sent: the pause may exist although the initial read has not shown it yet.
		pausedTouched = true;
		paused = false;
		try {
			await ProtocolClient.setTabPaused(tab.id, false);
		} catch {
			paused = wasPaused;
		}
	}
}

async function togglePause() {
	if (tab == null) return;
	const before = paused;
	pausedTouched = true;
	paused = !before;
	try {
		await ProtocolClient.setTabPaused(tab.id, paused);
	} catch {
		paused = before;
	}
}

const status = $derived(
	!enabled ? 'Off for this site' : paused ? 'Paused in this tab' : 'Checking is on',
);
</script>

{#if host == null}
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <p class="text-muted-foreground text-sm">Inkling cannot check this page</p>
      <Switch aria-label="Check this site" disabled checked={false} />
    </div>
    <Button variant="outline" size="sm" disabled><Pause />Pause in this tab</Button>
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
