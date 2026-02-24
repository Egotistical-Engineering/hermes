/**
 * Platform detection flags.
 * Use these to conditionally enable native features in Tauri
 * while keeping the web app unchanged.
 */
export const IS_TAURI = '__TAURI_INTERNALS__' in window;
export const IS_MOBILE = IS_TAURI && /android|ios/i.test(navigator.userAgent);
export const IS_DESKTOP = IS_TAURI && !IS_MOBILE;
export const IS_WEB = !IS_TAURI;
