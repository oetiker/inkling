import { defineManifest } from '@crxjs/vite-plugin';
import packageData from '../package.json';

const isDev = process.env.NODE_ENV == 'development';

/**
 * Builds a CSP string that:
 *   • always meets the MV3 minimum (`'self'`)
 *   • whitelists the Vite HMR server only when `isDev` is true
 *
 * NOTE: `'unsafe-eval'` is *omitted* because Chrome blocks it outright.
 */
export function makeExtensionCSP(isDev: boolean): string {
	const scriptSrc = ["'self'"]; // minimum, cannot add more
	const objectSrc = ["'self'"]; // standard
	// The LanguageTool server is chosen by the user, so any http(s) origin may be needed.
	const connectSrc = ["'self'", 'https:', 'http:']; // WebSocket goes here
	const styleSrc = ["'self'", "'unsafe-inline'"];
	const fontSrc = ["'self'", 'data:'];

	if (isDev) {
		// `ws://` and `http://` use the same host:port → list both
		connectSrc.push('http://localhost:5173', 'ws://localhost:5173');
		// include the 127.0.0.1 loopback in case you switch hosts
		connectSrc.push('http://127.0.0.1:*', 'ws://127.0.0.1:*');
		styleSrc.push('http://localhost:5173', 'http://127.0.0.1:*');
	}

	// Assemble the semicolon-delimited CSP
	return `${[
		`script-src ${scriptSrc.join(' ')}`,
		`object-src ${objectSrc.join(' ')}`,
		`connect-src ${connectSrc.join(' ')}`,
		`style-src ${styleSrc.join(' ')}`,
		`font-src ${fontSrc.join(' ')}`,
	].join('; ')};`;
}

/**
 * Test builds (`make test-chromium`) get the loopback origin up front, so the
 * settings page's permission request resolves without a browser dialog that
 * Playwright cannot click. The pattern has no port because the settings page
 * requests `http://127.0.0.1/*`.
 */
const testHostPermissions = process.env.INKLING_TEST_BUILD === '1' ? ['http://127.0.0.1/*'] : [];

export default defineManifest({
	name: `Inkling${isDev ? ' ➡️ Dev' : ''}`,
	description: packageData.description,
	version: packageData.version,
	manifest_version: 3,
	action: {
		default_popup: 'popup.html',
		default_icon: {
			'16': 'icon-16.png',
			'32': 'icon-32.png',
		},
	},
	options_page: 'options.html',
	browser_specific_settings: {
		gecko: {
			id: 'inkling@oetiker.ch',
			strict_min_version: '146.0',
		},
	},
	background: {
		service_worker: 'src/background/index.ts',
		scripts: ['src/background/index.ts'],
		type: 'module',
	},
	content_scripts: [
		{
			matches: ['https://docs.google.com/document/*'],
			all_frames: false,
			js: ['src/contentScript/googleDocsBootstrap.js'],
			run_at: 'document_start',
			world: 'MAIN',
		},
		{
			matches: ['<all_urls>'],
			all_frames: true,
			match_about_blank: true,
			// CRXJS's manifest types do not include this Chromium manifest option.
			// @ts-expect-error Valid for Manifest V3 content scripts.
			match_origin_as_fallback: true,
			js: ['src/contentScript/index.ts'],
			run_at: 'document_idle',
		},
	],
	web_accessible_resources: [
		{
			matches: ['<all_urls>'],
			resources: [
				'google-docs-bridge.js',
				'google-docs-protocol.js',
				'google-docs-bridge-request-handler.js',
			],
		},
	],
	icons: {
		'16': 'icon-16.png',
		'32': 'icon-32.png',
		'48': 'icon-48.png',
		'128': 'icon-128.png',
		'512': 'logo.png',
	},
	permissions: ['storage', 'tabs'],
	content_security_policy: {
		extension_pages: makeExtensionCSP(isDev),
	},
	// Requested from the settings page for the origin of the configured server.
	optional_host_permissions: ['https://*/*', 'http://*/*'],
	...(testHostPermissions.length > 0 ? { host_permissions: testHostPermissions } : {}),
});
