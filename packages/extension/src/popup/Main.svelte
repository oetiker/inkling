<script lang="ts">
import { Button } from 'components';
import ProtocolClient from '../ProtocolClient';

let enabled = $state(true);
let domain = $state('');
let serverConfigured: boolean | null = $state(null);

getCurrentTabDomain().then((d) => {
	domain = d ?? '';
});

ProtocolClient.getServerSettings().then((s) => {
	serverConfigured = s.serverUrl.length > 0;
});

$effect(() => {
	ProtocolClient.getDomainEnabled(domain).then((e) => {
		enabled = e;
	});
});

/**
 * Returns the hostname of the tab that the user had open when they clicked
 * the extension icon. If the URL is unavailable (about:blank, chrome://…) it
 * resolves to undefined.
 */
async function getCurrentTabDomain(): Promise<string | undefined> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

	if (!tab?.url) return undefined;

	try {
		const { hostname } = new URL(tab.url);
		return hostname.replace(/^www\./, '');
	} catch {
		return undefined;
	}
}

function toggleDomainEnabled() {
	enabled = !enabled;
	ProtocolClient.setDomainEnabled(domain, enabled);
}
</script>

<main>
  {#if serverConfigured === false}
    <section class="p-4 text-sm bg-primary">
      No LanguageTool server is set. Open the
      <button type="button" class="underline cursor-pointer" onclick={() => ProtocolClient.openOptions()}>settings</button>
      to add one.
    </section>
  {/if}

  <section class="p-6 space-y-5 text-gray-800 flex flex-row">
      <Button
        size="lg"
        class="rounded-full! aspect-square h-24 w-24 p-0 shadow-lg transition-colors flex! flex-row justify-center"
        color={enabled ? 'var(--color-primary)' : 'var(--color-cream-50)'}
        on:click={toggleDomainEnabled}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-9 w-9"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
          color={enabled ? 'var(--color-cream-50)' : 'var(--color-primary)'}
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 5v7m5.657-4.657a8 8 0 11-11.314 0"
          />
        </svg>
      </Button>

    <section class="items-end p-2">
      <p class="text-sm font-medium font-sans dark:text-white text-right">
        Checking is {enabled ? 'enabled on ' : 'disabled on '}{domain.length > 10 ? "this page" : domain}.
      </p>
    </section>
  </section>
</main>
