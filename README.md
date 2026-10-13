# Inkling

Inkling is a Chrome and Firefox extension that checks what you type on web pages with
your own [LanguageTool](https://github.com/languagetool-org/languagetool)
server. Text goes only to the server you configure.

It is a fork of the browser extension of
[Harper](https://github.com/Automattic/harper) (Apache-2.0), based on Harper
commit `6bb9b661`. The fork keeps Harper's page integration (highlights,
suggestion popup, editor support) and replaces Harper's built-in English
checker with requests to a LanguageTool server. Everything else from the
Harper repository was removed.

This project is not affiliated with LanguageTooler GmbH or with Automattic.

## Install

```sh
make chrome    # packages/chrome-plugin/package/inkling-chrome.zip
make firefox   # packages/chrome-plugin/package/inkling-firefox.zip
```

Load the unpacked `packages/chrome-plugin/build` directory in
`chrome://extensions` (developer mode), or the zip in `about:debugging` in
Firefox.

To ship a build with a server already set:

```sh
LT_DEFAULT_SERVER_URL=https://lt.example.com make chrome
```

## Settings

- `Server URL`: Base URL of the LanguageTool server, for example
  `https://lt.example.com` or `http://localhost:8081`. Empty turns checking off.
  Saving asks the browser for access to that server.
- `Preferred Variants`: Comma-separated variants such as `de-CH,en-GB`. The
  server uses them when it detects the language of a text.
- `Enable on New Sites by Default`: Off by default. Checking runs only on the
  sites in the built-in list and on sites you switch on in the popup.
- `Delay`: Milliseconds to wait after typing stops before the text is sent to
  the server. Default 500.
- `Disabled Rules`: LanguageTool rule IDs, one per line. "Disable rule" in a
  suggestion adds its rule here.
- `User Dictionary`: Words that are never marked as spelling mistakes.

## Development

```sh
make check       # TypeScript and Svelte checks
make lint        # Biome
make test-unit   # connector tests, no browser needed
make test        # unit tests plus Playwright tests in Chromium and Firefox
```

The Playwright tests run headed under `xvfb-run` against a stand-in server in
`packages/chrome-plugin/tests/mockLanguageTool.mjs`. Set `LT_TEST_SERVER` to run
the Chromium test against a real server.

## License

Apache-2.0, see [LICENSE](LICENSE). Copyright for the original code remains with
the Harper authors.
