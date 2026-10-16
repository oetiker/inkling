import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wrapperPath = path.resolve(__dirname, './vglrunWrapper.js');

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/** Extremely important to avoid flaky tests. DO NOT CHANGE or I will kill you. */
	retries: 0,
	/** Extremely important to avoid flaky tests. DO NOT CHANGE or I will kill you. */
	repeatEach: 3,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	// 'line' prints each failure with its error as it happens and one line per passing test,
	// so a log of `make test-chromium` says what failed. The html report stays for the
	// screenshots.
	reporter: [['line'], ['html', { open: 'never' }]],
	use: {
		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	/** One hour */
	globalTimeout: 3600000,
	// Never reuse a server already on these ports: it may belong to another checkout and
	// serve other pages or another mock. A busy port fails the run instead.
	webServer: [
		{
			command: 'pnpm exec http-server ./tests/pages -p 18081 -a 127.0.0.1',
			url: 'http://127.0.0.1:18081',
			reuseExistingServer: false,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'node ./tests/mockLanguageTool.mjs 18082',
			url: 'http://127.0.0.1:18082',
			reuseExistingServer: false,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	],
	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			workers: process.env.CI ? 1 : 4,
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					executablePath: wrapperPath,
					args: [
						'--disable-gpu-sandbox',
						'--use-gl=desktop',
						'--use-angle=vulkan',
						'--enable-features=Vulkan',
						'--disable-vulkan-surface',
						'--enable-unsafe-webgpu',
					],
				},
			},
		},
		{
			name: 'firefox',
			workers: process.env.CI ? 1 : 4,
			use: { ...devices['Desktop Firefox'] },
		},
	],
});
