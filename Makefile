# Build and test the browser extension. All work happens in packages/extension;
# the lint-framework package is built first because the extension imports it.

EXT := packages/extension
# Playwright runs Chromium extensions only in headed mode; xvfb-run gives it a display.
HEADED := xvfb-run -a

.PHONY: all install deps chrome firefox check lint test test-unit test-chromium test-firefox clean icons

all: chrome firefox

install:
	pnpm install

deps: install
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
	cd $(EXT) && INKLING_TEST_BUILD=1 TARGET_BROWSER=chrome pnpm build
	cd $(EXT) && $(HEADED) pnpm exec playwright test --headed --project=chromium

test-firefox: deps
	cd $(EXT) && LT_DEFAULT_SERVER_URL=http://127.0.0.1:18082 TARGET_BROWSER=firefox pnpm build
	cd $(EXT) && LT_DEFAULT_SERVER_URL=http://127.0.0.1:18082 $(HEADED) pnpm exec playwright test --headed --project=firefox

## Redraw the icon and logo from scripts/icon.py and render the PNG sizes (needs inkscape)
icons:
	python3 $(EXT)/scripts/icon.py
	inkscape $(EXT)/public/logo.svg -o $(EXT)/public/logo.png -w 512
	for s in 16 32 48 128; do inkscape $(EXT)/public/logo.svg -o $(EXT)/public/icon-$$s.png -w $$s; done

clean:
	rm -rf $(EXT)/build $(EXT)/package packages/lint-framework/dist
