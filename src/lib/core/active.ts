// Which work session is open right now, remembered per browser so it follows the person from tool to tool.
// Only the session's id is stored here; the file and its versions live in session.ts (IndexedDB).
export const ACTIVE_KEY = 'smartedit.activeWork';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const local = (): Store | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };

export function getActiveId(s: Store | undefined = local()): string | undefined {
  try { return s?.getItem(ACTIVE_KEY) || undefined; } catch { return undefined; }
}
export function setActiveId(id: string | undefined, s: Store | undefined = local()) {
  try { if (id) s?.setItem(ACTIVE_KEY, id); else s?.removeItem(ACTIVE_KEY); } catch { /* storage unavailable */ }
}
