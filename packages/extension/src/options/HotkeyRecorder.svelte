<script lang="ts">
import { onDestroy } from 'svelte';
import { Button } from '$lib/components/ui/button/index.js';
import { Kbd } from '$lib/components/ui/kbd/index.js';
import { t } from '../i18n';
import type { Hotkey, Modifier } from '../protocol';

let { hotkey, onchange, id }: { hotkey: Hotkey; onchange: (hotkey: Hotkey) => void; id?: string } =
	$props();

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
  <span class="flex gap-1" aria-label={t('currentHotkey')}>
    {#each [...hotkey.modifiers, hotkey.key] as part}
      <Kbd>{part}</Kbd>
    {/each}
  </span>
  <Button
    {id}
    variant="outline"
    size="sm"
    aria-labelledby={id ? `${id}-label ${id}-text` : undefined}
    onclick={recording ? stop : start}
  >
    <span id={id ? `${id}-text` : undefined}>{recording ? t('pressKeys') : t('changeHotkey')}</span>
  </Button>
  <span class="sr-only" aria-live="polite">{recording ? t('pressKeys') : ''}</span>
</div>
