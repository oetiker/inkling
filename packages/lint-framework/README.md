# `lint-framework`

The `lint-framework` serves one specific purpose.
It contains all the logic needed to read and write text to a text editor on a web page to perform linting actions, as well as all logic needed to render underlines and UI for reviewing those actions.
It came from Harper's browser extension and is kept as its own package, so that the page integration stays separate from the extension's LanguageTool connection.
