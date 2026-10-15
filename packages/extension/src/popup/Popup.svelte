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

// A tab that cannot be read counts as unknown, which shows the cannot-check state.
currentTab()
	.catch(() => undefined)
	.then((t) => {
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

<style>
  /* Chrome shows the popup without a frame; Firefox draws its own around it. */
  @supports not (-moz-appearance: none) {
    main {
      border: 1px solid var(--border);
    }
  }
</style>
