<script lang="ts">
import { Link } from 'components';
import logo from '/logo.png';
import Main from './Main.svelte';

const name = chrome.runtime.getManifest().name;
const version = `v${chrome.runtime.getManifest().version}`;

function openSettings() {
	chrome.runtime?.openOptionsPage?.();
}
</script>

<div class="w-[340px] border border-gray-200 font-sans flex flex-col rounded-lg shadow-sm select-none dark:border-slate-800 dark:text-slate-100">
  <header class="flex flex-row justify-between items-center gap-2 px-3 py-2 rounded-t-lg">
    <div class="flex flex-row justify-start items-center gap-1">
      <img src={logo} alt="" class="h-6 w-auto rounded-lg mx-2" />
      <span class="font-semibold text-sm">{name}</span>
    </div>
    <span class="text-sm font-mono">{version}</span>
  </header>

  <Main />

  <footer class="flex items-center justify-center gap-6 px-3 py-2 text-sm border-t border-gray-100 rounded-b-lg bg-white/60 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
    <Link on:click={openSettings}>Settings</Link>
  </footer>
</div>
