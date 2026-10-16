# Building Inkling from source

These steps build the Firefox package `inkling-firefox.zip` from the source
archive. The files in it are the same as in the package uploaded to
addons.mozilla.org; only the time stamps in the zip differ. Vite bundles the
code without minifying it.

## Requirements

- Linux or macOS with `make`, `bash` and `git`.
- Node.js, current LTS release (24 at the time of writing). The file
  `.node-version` says `lts/*`.
- pnpm 12.11.2. The `packageManager` field in `package.json` pins this
  version. One way to get it:

  ```sh
  npm install -g pnpm@12.11.2
  ```

- Network access to the npm registry for `pnpm install`. The file
  `pnpm-lock.yaml` fixes the version of every package.

## Build

From the top directory of the source archive:

```sh
make firefox
```

`make firefox` runs these steps:

1. `pnpm install`: Installs the packages listed in `pnpm-lock.yaml`.
2. `pnpm build` in `packages/lint-framework`: Builds the page integration
   library that the extension imports.
3. `TARGET_BROWSER=firefox vite build` in `packages/extension`: Writes the
   extension to `packages/extension/build/`.
4. `node src/zip.js`: Packs `build/` into
   `packages/extension/package/inkling-firefox.zip`.

The environment variable `LT_DEFAULT_SERVER_URL` must be unset or empty. Set,
it builds a package with a server already filled in.

`make chrome` builds `packages/extension/package/inkling-chrome.zip` in the
same way.

## Source layout

- `packages/extension/src/`: Background script, content scripts, popup and
  settings page.
- `packages/extension/public/`: Icons, translations (`_locales/`) and the
  scripts that run inside Google Docs.
- `packages/lint-framework/src/`: Highlights, suggestion card and editor
  support, taken from Harper.
