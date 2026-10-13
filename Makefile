# Build and test the browser extension. All work happens in packages/extension;
# the components and lint-framework packages are built first because it imports them.

EXT := packages/extension
# Playwright runs Chromium extensions only in headed mode; xvfb-run gives it a display.
HEADED := xvfb-run -a

.PHONY: all install deps chrome firefox check lint test test-unit test-chromium test-firefox clean

all: chrome firefox

install:
	pnpm install

deps: install
	cd packages/components && pnpm build
	cd packages/lint-framework && pnpm build

## Build build/ and package/inkling-chrome.zip
chrome: deps
	cd $(EXT) && pnpm zip-for-chrome

## Build build/ and package/inkling-firefox.zip
firefox: deps
	cd $(EXT) && pnpm zip-for-firefox

check: deps
	cd $(EXT) && pnpm check

lint:
	pnpm check

test: test-unit test-chromium test-firefox

test-unit: deps
	cd $(EXT) && pnpm test:unit

test-chromium: deps
	cd $(EXT) && TARGET_BROWSER=chrome pnpm build
	cd $(EXT) && $(HEADED) pnpm exec playwright test --headed --project=chromium

test-firefox: deps
	cd $(EXT) && LT_DEFAULT_SERVER_URL=http://127.0.0.1:18082 TARGET_BROWSER=firefox pnpm build
	cd $(EXT) && LT_DEFAULT_SERVER_URL=http://127.0.0.1:18082 $(HEADED) pnpm exec playwright test --headed --project=firefox

clean:
	rm -rf $(EXT)/build $(EXT)/package packages/components/dist packages/lint-framework/dist
