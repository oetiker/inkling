import sveltePreprocess from 'svelte-preprocess';

// Read by svelte-check; the build passes the same preprocessor in vite.config.ts.
export default {
	preprocess: sveltePreprocess(),
};
