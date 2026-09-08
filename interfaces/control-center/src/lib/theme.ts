export const CONTROL_CENTER_THEMES = ["classic", "dark", "light"] as const;
export type ControlCenterTheme = (typeof CONTROL_CENTER_THEMES)[number];
export const DEFAULT_THEME: ControlCenterTheme = "classic";
export const THEME_STORAGE_KEY = "pritha-control-center-theme-v2";
export const THEME_CHANGED_EVENT = "pritha-theme-changed";

export function normalizeTheme(value:unknown):ControlCenterTheme {
  return CONTROL_CENTER_THEMES.includes(value as ControlCenterTheme) ? value as ControlCenterTheme : DEFAULT_THEME;
}
export function readStoredTheme():ControlCenterTheme {
  try {return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));}
  catch {return DEFAULT_THEME;}
}
export function applyTheme(theme:ControlCenterTheme) {
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.themePreference=theme;
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
}
export function selectTheme(value:ControlCenterTheme) {
  let theme=normalizeTheme(value);
  try {window.localStorage.setItem(THEME_STORAGE_KEY,theme);}
  catch {theme=DEFAULT_THEME;}
  applyTheme(theme);
}

// The legacy key is intentionally neither read nor written. Its dark meant Classic.
export const themeInitScript = `(() => {
  let theme = "classic";
  try {
    const value = window.localStorage.getItem("pritha-control-center-theme-v2");
    if (["classic", "dark", "light"].includes(value)) theme = value;
  } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = theme;
})();`;
