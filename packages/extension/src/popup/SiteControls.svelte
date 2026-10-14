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
