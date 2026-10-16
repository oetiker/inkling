<script lang="ts">
import Pause from '@lucide/svelte/icons/pause';
import Play from '@lucide/svelte/icons/play';
import * as Alert from '$lib/components/ui/alert/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Switch } from '$lib/components/ui/switch/index.js';
import { t } from '../i18n';
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
// Without the stored state the switch and the pause button would only guess.
let loadError: string | null = $state(null);

function showLoadError(e: unknown) {
	loadError = e instanceof Error ? e.message : String(e);
}

$effect(() => {
	if (host != null && tab != null) {
		ProtocolClient.getDomainEnabled(host)
			.then((e) => {
				if (!enabledTouched) enabled = e;
			})
			.catch(showLoadError);
		ProtocolClient.getTabPaused(tab.id)
			.then((p) => {
				if (!pausedTouched) paused = p;
			})
			.catch(showLoadError);
	}
});

async function onSiteChange(checked: boolean) {
	if (host == null || tab == null) return;
	const wasEnabled = enabled;
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
		const wasPaused = paused;
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

const status = $derived(!enabled ? t('statusSiteOff') : paused ? t('statusPaused') : t('statusOn'));
</script>

{#if host == null}
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <p class="text-muted-foreground text-sm">{t('cannotCheckPage')}</p>
      <Switch aria-label={t('checkThisSite')} disabled checked={false} />
    </div>
    <Button variant="outline" size="sm" disabled><Pause />{t('pauseInTab')}</Button>
  </div>
{:else if loadError != null}
  <Alert.Root variant="destructive">
    <Alert.Description>{t('couldNotLoadSite', loadError)}</Alert.Description>
  </Alert.Root>
{:else}
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col">
        <span class="truncate font-medium" title={host}>{shownHost}</span>
        <Label for="site-switch" class="text-muted-foreground text-xs font-normal">{t('checkThisSite')}</Label>
      </div>
      <Switch id="site-switch" aria-label={t('checkThisSite')} checked={enabled} onCheckedChange={onSiteChange} />
    </div>
    <p class="text-muted-foreground text-sm" aria-live="polite">{status}</p>
    {#if enabled}
      <Button variant="outline" size="sm" onclick={togglePause}>
        {#if paused}<Play />{t('resumeInTab')}{:else}<Pause />{t('pauseInTab')}{/if}
      </Button>
    {/if}
  </div>
{/if}
