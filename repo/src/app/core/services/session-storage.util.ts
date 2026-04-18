export const LS_KEYS = {
  THEME: 'fc_theme',
  GRID_SIZE: 'fc_grid_size',
  HOTKEY_PROFILE: 'fc_hotkey_profile',
  LAST_PROJECT: 'fc_last_project',
  FEATURE_FLAGS: 'fc_feature_flags',
  SESSION: 'fc_session',
  COOLDOWN_PREFIX: 'fc_cooldown_'
} as const;

export function lsGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch { /* quota or disabled */ }
}

export function lsRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch { /* no-op */ }
}

export function lsGetJson<T>(key: string): T | null {
  const raw = lsGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function lsSetJson<T>(key: string, value: T): void {
  lsSet(key, JSON.stringify(value));
}
