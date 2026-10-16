<script lang="ts">
import logo from '/logo.svg';
import { t } from '../i18n';

let { subtitle }: { subtitle?: string } = $props();

const manifest = chrome.runtime.getManifest();
</script>

<header class="flex items-center gap-3">
  <img src={logo} alt={t('logoAlt')} class="size-12" />
  <div class="flex flex-1 flex-col">
    <span class="text-lg font-semibold leading-tight">{manifest.name}</span>
    {#if subtitle}
      <span class="text-muted-foreground text-xs">{subtitle}</span>
    {/if}
  </div>
  <span class="text-muted-foreground font-mono text-xs">v{manifest.version}</span>
</header>
