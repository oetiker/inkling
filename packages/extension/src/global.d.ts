/// <reference types="svelte" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

/** Server URL compiled in from the LT_DEFAULT_SERVER_URL build variable; empty when unset. */
declare const __DEFAULT_SERVER_URL__: string;

/** Firefox only: copies an object from a content script into the page's world. */
declare const cloneInto: (<T>(value: T, target: Window) => T) | undefined;
