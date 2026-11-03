// Small per-browser preferences (theme, default OCR language). Every read and write is guarded: storage can be unavailable.
export type Theme = 'system' | 'dark' | 'light';
export const THEME_KEY = 'smartedit.theme';
export const OCR_KEY = 'smartedit.ocrLang';
export const PREFIX = 'smartedit.';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'length' | 'key'>;
const local = (): Store | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };

export function getTheme(s: Store | undefined = local()): Theme {
  try { const v = s?.getItem(THEME_KEY); return v === 'dark' || v === 'light' ? v : 'system'; } catch { return 'system'; }
}
export function setTheme(t: Theme, s: Store | undefined = local()) {
  try { if (t === 'system') s?.removeItem(THEME_KEY); else s?.setItem(THEME_KEY, t); } catch { /* ignore */ }
}
/** Shows the chosen theme right now. 'system' removes the override so the device setting applies. */
export function applyTheme(t: Theme, root: { dataset: DOMStringMap } = document.documentElement) {
  if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
}
/** The saved default OCR language, or 'eng' if none is saved or it is not one of `valid`. */
export function getOcrLang(valid: string[], s: Store | undefined = local()): string {
  try { const v = s?.getItem(OCR_KEY); return v && valid.includes(v) ? v : 'eng'; } catch { return 'eng'; }
}
export function setOcrLang(code: string, s: Store | undefined = local()) { try { s?.setItem(OCR_KEY, code); } catch { /* ignore */ } }
/** Forget every preference this site saved (theme, language, recent-list marker), leaving other keys alone. */
export function clearPrefs(s: Pick<Storage, 'length' | 'key' | 'removeItem'> | undefined = local()) {
  try {
    if (!s) return;
    const keys: string[] = []; for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
    for (const k of keys) s.removeItem(k);
  } catch { /* ignore */ }
}
