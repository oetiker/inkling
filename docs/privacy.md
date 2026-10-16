# Inkling privacy policy

Last change: 2026-10-16

[Deutsche Fassung](#datenschutzerklärung)

Inkling is a browser extension for Chrome and Firefox. It checks the text you
type on web pages for spelling, grammar and style mistakes with a LanguageTool
server that you choose.

## What leaves your browser

Inkling sends text to one place only: the LanguageTool server set in
`Server URL` on the settings page. As long as this field is empty, Inkling sends
nothing anywhere.

When checking is on for a site and you type in a text field there, Inkling
sends to that server:

- the text of the field you are typing in,
- your `Preferred variants` setting, for example `de-CH,en-GB`,
- your `Disabled rules` setting.

The text can contain anything you type, emails and chat messages among them.
"Save and Test" on the settings page sends the word "Test" to the server.

Inkling does not send the address of the page, your user dictionary, cookies or
anything else. The developer of Inkling runs no server for the extension and
receives no data from it. Inkling has no analytics, no tracking and no
advertising.

## The server you choose

The server decides what happens with the text it receives. If you run your own
server, that is up to you. If you click "Use public server" on the settings
page, the text goes to `https://api.languagetool.org`, run by LanguageTooler
GmbH, and their privacy policy applies:
<https://languagetool.org/legal/privacy>.

## What Inkling stores

Inkling keeps its settings in your browser's extension storage on your device:
the server address, preferred variants, disabled rules, the delay, the hotkeys,
your user dictionary, the sites you switched on or off, and a short code for
each suggestion you chose to ignore (not the text itself). A pause for a tab
lasts until you reload or close that tab. Inkling does not sync this data
between devices. Removing the extension deletes it.

## Permissions

- `storage`: Keeps the settings listed above.
- `tabs`: Reads the address of the current tab, so the popup can show the site
  name and switch checking on or off for that site.
- Access to the server address: Requested when you save a `Server URL`, so
  Inkling can send text to that server.
- Content scripts on all sites: Inkling must find text fields on any page you
  write on. On sites where checking is off, it does not read the text.

## Contact

Tobias Oetiker, <tobi@oetiker.ch>. Source code and bug reports:
<https://github.com/oetiker/inkling>.

---

# Datenschutzerklärung

Letzte Änderung: 2026-10-16

Inkling ist eine Browser-Erweiterung für Chrome und Firefox. Sie prüft Text, den
Sie auf Webseiten eingeben, auf Rechtschreib-, Grammatik- und Stilfehler. Dazu
nutzt sie einen LanguageTool-Server, den Sie selbst wählen.

## Was Ihren Browser verlässt

Inkling sendet Text an genau eine Stelle: an den LanguageTool-Server, der in den
Einstellungen unter «Server-URL» steht. Solange dieses Feld leer ist, sendet
Inkling nichts.

Wenn die Prüfung für eine Website eingeschaltet ist und Sie dort in ein
Textfeld schreiben, sendet Inkling an diesen Server:

- den Text des Feldes, in dem Sie schreiben,
- Ihre Einstellung «Bevorzugte Varianten», zum Beispiel `de-CH,en-GB`,
- Ihre Einstellung «Ausgeschaltete Regeln».

Der Text kann alles enthalten, was Sie schreiben, auch E-Mails und
Chat-Nachrichten. «Speichern und testen» in den Einstellungen sendet das Wort
«Test» an den Server.

Inkling sendet weder die Adresse der Seite noch Ihr eigenes Wörterbuch, Cookies
oder andere Daten. Der Entwickler von Inkling betreibt keinen Server für die
Erweiterung und erhält keine Daten von ihr. Inkling enthält keine Statistik,
kein Tracking und keine Werbung.

## Der Server Ihrer Wahl

Der Server entscheidet, was mit dem empfangenen Text geschieht. Betreiben Sie
einen eigenen Server, liegt das bei Ihnen. Klicken Sie in den Einstellungen auf
«Öffentlichen Server verwenden», geht der Text an
`https://api.languagetool.org`, betrieben von der LanguageTooler GmbH; dann gilt
deren Datenschutzerklärung: <https://languagetool.org/de/legal/privacy>.

## Was Inkling speichert

Inkling speichert seine Einstellungen im Erweiterungsspeicher Ihres Browsers auf
Ihrem Gerät: Serveradresse, bevorzugte Varianten, ausgeschaltete Regeln,
Verzögerung, Tastenkürzel, Ihr eigenes Wörterbuch, die Websites, die Sie ein-
oder ausgeschaltet haben, und für jeden ignorierten Vorschlag einen kurzen Code
(nicht den Text selbst). Eine Pause für einen Tab gilt, bis Sie den Tab neu
laden oder schliessen. Inkling gleicht diese Daten nicht zwischen Geräten ab.
Wenn Sie die Erweiterung entfernen, werden sie gelöscht.

## Berechtigungen

- `storage`: Speichert die oben genannten Einstellungen.
- `tabs`: Liest die Adresse des aktuellen Tabs, damit das Popup den Namen der
  Website zeigen und die Prüfung für diese Website ein- oder ausschalten kann.
- Zugriff auf die Serveradresse: Wird beim Speichern einer Server-URL
  angefragt, damit Inkling Text an diesen Server senden kann.
- Inhaltsskripte auf allen Websites: Inkling muss Textfelder auf jeder Seite
  finden, auf der Sie schreiben. Auf Websites, auf denen die Prüfung
  ausgeschaltet ist, liest Inkling den Text nicht.

## Kontakt

Tobias Oetiker, <tobi@oetiker.ch>. Quellcode und Fehlermeldungen:
<https://github.com/oetiker/inkling>.
