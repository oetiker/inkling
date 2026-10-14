import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Read by svelte-check and, automatically, by the vite build.
export default {
	preprocess: vitePreprocess(),
};
