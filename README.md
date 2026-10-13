# Inkling

Inkling is a Chrome and Firefox extension that checks what you type on web pages with
your own [LanguageTool](https://github.com/languagetool-org/languagetool)
server. Text goes only to the server you configure.

This project is not affiliated with LanguageTooler GmbH or with Automattic.

## Built on Harper

Inkling exists because of [Harper](https://github.com/Automattic/harper), the
open-source grammar checker by Elijah Potter, its contributors and Automattic.
Almost everything you see on a web page is their work: the highlights, the
suggestion popup, the hotkeys, the per-site switch, and the editor support for
plain text fields, Lexical, ProseMirror, Slate, Quill, Draft.js, iframes and
Google Docs. Each of those editors needed its own careful work, and Harper's
team published all of it under Apache-2.0, so others can build on it.

Inkling is a fork of Harper's browser extension at commit `6bb9b661`. It
replaces Harper's built-in checker with requests to a LanguageTool server, which
adds German and the other LanguageTool languages. Everything else from the
Harper repository was removed.

If you write in English, use Harper itself. It runs entirely in your browser,
needs no server, and is fast:
<https://writewithharper.com>.

## Install

```sh
make chrome    # packages/extension/package/inkling-chrome.zip
make firefox   # packages/extension/package/inkling-firefox.zip
```

Load the unpacked `packages/extension/build` directory in
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
`packages/extension/tests/mockLanguageTool.mjs`. Set `LT_TEST_SERVER` to run
the Chromium test against a real server.

## License

Apache-2.0, see [LICENSE](LICENSE). Copyright for the original code remains with
the Harper authors.
