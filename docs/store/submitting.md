# Submitting Inkling to the stores

Steps to publish a release in the Chrome Web Store and on addons.mozilla.org
(AMO). The texts to paste are in [listing.md](listing.md); the screenshots are
described at the end of this file.

## 1. Build the packages

Each store gets the zip of a tagged release.

1. Check that `CHANGES.md` describes the release and that `version` in
   `packages/extension/package.json` is the version to publish.
2. Push `main`, then tag and push the tag:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

   Push only this tag. `git push --tags` would also push the old Harper tags,
   and every `v*` tag starts a release build.
3. Wait for the "extension" workflow on GitHub. It runs all tests and puts
   `inkling-chrome.zip` and `inkling-firefox.zip` into a draft release.
4. Download both zips from the draft release. Do not publish the draft yet.
5. Check that neither package has a server set or host access granted at
   install time:

   ```sh
   unzip -p inkling-chrome.zip manifest.json | grep -c '"host_permissions"'
   unzip -p inkling-firefox.zip manifest.json | grep -c '"host_permissions"'
   ```

   Both must print `0`.
6. Make the source archive for AMO:

   ```sh
   git archive --format=zip -o inkling-source-0.1.0.zip v0.1.0
   ```

A local build gives the same files: `make chrome firefox` with
`LT_DEFAULT_SERVER_URL` unset; the zips land in `packages/extension/package/`.

## 2. Chrome Web Store

Dashboard: <https://chrome.google.com/webstore/devconsole>

### One-time account setup

- Sign in with the Google account that will own the listing, and turn on
  2-step verification for it.
- Pay the one-time developer registration fee.
- Account tab: set the publisher name, set the contact email
  `tobi@oetiker.ch` and confirm it through the link Google sends.
- Account tab: answer the trader question (EU Digital Services Act). A free
  hobby project is usually "non-trader"; decide this yourself.

### New item

1. "New item", upload `inkling-chrome.zip`.
2. **Package** tab: check that the version and the name "Inkling" are right.
3. **Store listing** tab:
   - Description: the English description from `listing.md`.
   - The summary under the name comes from the package (the `description` in
     the manifest, "Checks what you write in the browser with your own
     LanguageTool server"); the dashboard does not let you edit it.
   - Category: Productivity, then Tools. Language: English.
   - Screenshots: `1-card-en.png`, `3-popup-en.png`, `4-settings-en.png`,
     `2-card-de.png` (1280×800), all in
     [screenshots/](screenshots/).
   - Small promo tile: `5-promo-440x280.png`.
   - Homepage URL and support URL: <https://github.com/oetiker/inkling>.
   - German listing: switch the language selector at the top of the tab to
     Deutsch and paste the German description. Chrome shows it to users with
     a German browser; the German summary comes from the package.
4. **Privacy** tab: paste single purpose, the four permission
   justifications, "No" for remote code, tick the two data types and the
   three certifications, privacy policy URL. All in `listing.md`.
5. **Distribution** tab: Public, all regions.
6. **Test instructions** tab: paste the reviewer notes from `listing.md`.
7. "Submit for review". Untick "Publish automatically after review" if you
   want to publish by hand. Review takes from a day to a few weeks; extensions
   with access to all sites take longer.

## 3. addons.mozilla.org

Developer hub: <https://addons.mozilla.org/developers/>

### One-time account setup

- Sign in with a Mozilla account (create one with `tobi@oetiker.ch`).
- Accept the developer agreement when asked.

### New add-on

1. "Submit a New Add-on", choose "On this site" (listed).
2. Upload `inkling-firefox.zip`. Platform: Firefox for desktop only; Inkling
   is not tested on Firefox for Android.
3. The validator lists errors and warnings. Errors stop the upload; warnings
   do not. Expected warning: the unknown key `minimum_chrome_version`, which
   Firefox ignores.
4. Source code: answer "Yes" (the code is bundled) and upload
   `inkling-source-0.1.0.zip`.
5. Describe the add-on:
   - Name: Inkling. Add-on URL: `inkling`.
   - Summary and description: the English texts from `listing.md`.
   - Categories: Language Support, Productivity.
   - Support email: `tobi@oetiker.ch`. Support website:
     <https://github.com/oetiker/inkling/issues>.
   - License: Apache License 2.0.
   - Privacy policy: tick "This add-on has a privacy policy" and paste the
     English part of `docs/privacy.md`.
   - Notes to reviewer: the reviewer notes from `listing.md`, plus "Build
     steps: docs/store/building-from-source.md in the source archive."
6. Submit. The listing goes live after review.
7. After the submission: Edit Product Page, switch the locale selector to
   Deutsch, and enter the German summary and description.
8. Screenshots: Edit Product Page, Media, upload the same PNG files as for
   Chrome. AMO takes any size.

## 4. After both submissions

- Publish the draft release on GitHub.
- When a store asks for changes, fix them on `main`, raise the version in
  `packages/extension/package.json`, tag again and upload the new zip. A store
  never accepts the same version twice.

## Screenshots

The files in [screenshots/](screenshots/) show real checks. They came from a throwaway
Playwright spec that was not committed. To make new ones:

- Build the test package: `INKLING_TEST_BUILD=1 TARGET_BROWSER=chrome pnpm
  build` in `packages/extension`.
- Write a spec that sets `serverSettings` and `defaultEnable` through the
  background service worker, serves a neutral mail page with
  `context.route`, fills its text field with a text that has mistakes, waits
  for `#inkling-highlight`, clicks a mark and takes a 1280×800 screenshot.
- The settings page shot uses the public server, so a private server address
  never shows in the store.
