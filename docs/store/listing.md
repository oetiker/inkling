# Store listing

Text and answers for the Chrome Web Store and addons.mozilla.org (AMO). Copy
each block into the matching form field.

## Shared facts

- Name: Inkling
- Version: from `packages/extension/package.json`
- Homepage and support: <https://github.com/oetiker/inkling>
- Bug reports: <https://github.com/oetiker/inkling/issues>
- Contact email: tobi@oetiker.ch
- License: Apache-2.0
- Privacy policy:
  <https://github.com/oetiker/inkling/blob/main/docs/privacy.md>
- Chrome Web Store category: Productivity, Tools
- AMO categories: Language Support, Productivity
- Listing languages: English (default), German

## Summary

AMO only. The Chrome Web Store shows the `description` from the manifest
(`public/_locales/*/messages.json`, key `extensionDescription`) instead.

English (132 characters at most):

```text
Checks spelling, grammar and style as you type on any web page, with a LanguageTool server you choose. No account, no tracking.
```

German:

```text
Prüft Rechtschreibung, Grammatik und Stil beim Schreiben auf Webseiten, mit einem LanguageTool-Server Ihrer Wahl. Ohne Konto.
```

## Description

English:

```text
Inkling marks spelling, grammar and style mistakes while you write in text fields on web pages: web mail, chat, social media, issue trackers, Google Docs and most rich text editors. Click a marked word to see the explanation and the suggestions; one more click applies a suggestion.

The checks come from a LanguageTool server that you set on the settings page. Run your own server (it is open source and runs on a laptop or a small server), use the one your team runs, or try the public server of LanguageTool. Inkling sends your text to that server and nowhere else. It works with every language that LanguageTool checks, among them English, German, French, Spanish, Dutch and Portuguese.

Inkling stays out of your way while you type: it waits until you pause, checks only the field you are typing in, and does not slow down long texts.

Features:
• Marks in three colors: red for spelling, amber for grammar and punctuation, blue for style
• Apply a suggestion with a click or a hotkey
• Your own dictionary, ignored suggestions and disabled rules
• Preferred variants such as de-CH or en-GB
• Switch checking on or off per site, or pause it in one tab
• Settings and popup in English and German

Inkling is free software under the Apache-2.0 license. It is based on the browser extension of Harper, the open source grammar checker by Automattic. It is not affiliated with LanguageTooler GmbH or with Automattic.

Source code: https://github.com/oetiker/inkling
```

German:

```text
Inkling markiert Rechtschreib-, Grammatik- und Stilfehler, während Sie in Textfeldern auf Webseiten schreiben: in Webmail, Chats, sozialen Medien, Issue-Trackern, Google Docs und den meisten Editoren für formatierten Text. Ein Klick auf ein markiertes Wort zeigt die Erklärung und die Vorschläge; ein weiterer Klick übernimmt einen Vorschlag.

Die Prüfung macht ein LanguageTool-Server, den Sie in den Einstellungen festlegen. Betreiben Sie Ihren eigenen Server (er ist quelloffen und läuft auf einem Laptop oder einem kleinen Server), nutzen Sie den Server Ihres Teams, oder testen Sie mit dem öffentlichen Server von LanguageTool. Inkling sendet Ihren Text an diesen Server und an keine andere Stelle. Inkling prüft alle Sprachen, die LanguageTool prüft, darunter Deutsch, Englisch, Französisch, Spanisch, Niederländisch und Portugiesisch.

Inkling bremst Sie beim Schreiben nicht: Es wartet, bis Sie eine Pause machen, prüft nur das Feld, in dem Sie schreiben, und bleibt auch bei langen Texten schnell.

Funktionen:
• Markierungen in drei Farben: Rot für Rechtschreibung, Gelb für Grammatik und Zeichensetzung, Blau für Stil
• Vorschlag per Klick oder Tastenkürzel übernehmen
• Eigenes Wörterbuch, ignorierte Vorschläge und ausgeschaltete Regeln
• Bevorzugte Varianten wie de-CH oder en-GB
• Prüfung pro Website ein- oder ausschalten oder in einem Tab pausieren
• Einstellungen und Popup auf Deutsch und Englisch

Inkling ist freie Software unter der Lizenz Apache-2.0. Es baut auf der Browser-Erweiterung von Harper auf, der quelloffenen Grammatikprüfung von Automattic. Inkling steht in keiner Verbindung zur LanguageTooler GmbH oder zu Automattic.

Quellcode: https://github.com/oetiker/inkling
```

## Chrome Web Store: privacy practices tab

### Single purpose

```text
Inkling checks the text the user types in text fields on web pages for spelling, grammar and style mistakes, using a LanguageTool server the user configures, and shows the mistakes and suggestions in place.
```

### Permission justifications

- `storage`:

  ```text
  Stores the user's settings on the device: server address, preferred language variants, disabled rules, delay, hotkeys, the user's dictionary, the sites where checking is on or off, and the suggestions the user chose to ignore. A pause for one tab is kept in session storage.
  ```

- `tabs`:

  ```text
  The popup reads the URL of the active tab to show the site name and to switch checking on or off for that site. The background script sends setting changes to open tabs, so they take effect without a reload.
  ```

- Host permission (content scripts on all URLs):

  ```text
  The user writes in text fields on any web site, and the content script must find those fields to mark mistakes in them. On sites where checking is off, the content script does not read the text. The Google Docs content script on docs.google.com/document reads the document text, because Google Docs draws its text on a canvas instead of an editable field.
  ```

- Optional host permissions (`https://*/*`, `http://*/*`):

  ```text
  The user enters the address of their own LanguageTool server on the settings page. On save, the extension requests access to that one origin only, so it can send text to the server. No host access is granted at install time.
  ```

### Remote code

No, I am not using remote code. All JavaScript is in the package.

### Data usage

Checked:

- Personal communications: the text of emails and messages the user types,
  when checking is on for that site.
- Website content: the text the user types in text fields.

Not checked: all other categories.

Certifications (all three apply):

- I do not sell or transfer user data to third parties, outside of the
  approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

The text goes to the LanguageTool server that the user configures. This is
the single purpose of the extension and counts as an approved use case.

## AMO: additional fields

- Data collection: declared in the manifest as `websiteContent` and
  `personalCommunications`, both required.
- Privacy policy: paste the English part of `docs/privacy.md`.
- Source code: upload a zip of the repository at the release tag (`git archive
  --format=zip -o inkling-source.zip v0.1.0`); build steps are in
  `docs/store/building-from-source.md`.

## Notes for reviewers

Same text for both stores:

```text
Inkling needs a LanguageTool server to do anything. It ships without a server set, and it sends no text until the user sets one.

To test:
1. After installation the settings page opens. Click "Use public server", then "Save and Test". Allow the access to api.languagetool.org when the browser asks. The page shows "Connected:" followed by the server version.
2. Open https://textarea.online (checking is on there by default) and type: "This are a sentence with a speling mistake."
3. After half a second "are" and "speling" are marked. Click a marked word to see the suggestion card; click a suggestion to apply it.
4. The toolbar popup switches checking off for the site ("Check this site") or pauses it in the current tab.

The public LanguageTool server allows 20 requests per minute per IP address. If the marks stop appearing during a long test, wait a minute.

The code is bundled with Vite, not minified. Build instructions: docs/store/building-from-source.md in the source upload.
```
