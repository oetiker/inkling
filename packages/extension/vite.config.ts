import { crx } from '@crxjs/vite-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import manifest from './src/manifest.ts';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	const browser = env.TARGET_BROWSER ?? 'chrome';

	if (browser !== 'chrome' && browser !== 'firefox') {
		throw new Error('UNSUPPORTED BROWSER TYPE');
	}

	console.log(`Building for ${browser}`);

	const production = mode === 'production';

	return {
		define: {
			// Lets a build ship with a server already set, e.g. for a team's own server.
			__DEFAULT_SERVER_URL__: JSON.stringify(env.LT_DEFAULT_SERVER_URL ?? ''),
		},
		build: {
			minify: false,
			outDir: 'build',
			rolldownOptions: {
				output: {
					chunkFileNames: 'assets/chunk-[hash].js',
				},
			},
		},
		plugins: [
			tailwindcss(),
			crx({
				manifest,
				browser,
				// Google Docs reads the flag this script sets very early, so it must run
				// as a plain script at document_start, not behind the async loader.
				contentScripts: { standaloneFiles: ['src/contentScript/googleDocsBootstrap.js'] },
			}) as unknown as PluginOption,
			svelte({
				compilerOptions: {
					dev: !production,
				},
			}),
		],
		resolve: {
			alias: {
				'@': path.resolve(import.meta.dirname, 'src'),
				$lib: path.resolve(import.meta.dirname, 'src/lib'),
			},
		},
		legacy: {
			skipWebSocketTokenCheck: true,
		},
	};
});
