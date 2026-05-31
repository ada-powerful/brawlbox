// BYOK key storage. In-memory by default; opt-in localStorage persistence.
// The key never leaves the browser except to the model provider (commitment 3b.7).
// Module-level state is fine here — the no-module-state rule applies to engine/ only.
const STORAGE_KEY = 'ftg.apiKey.openai';

let memKey: string | null = null;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // Accessing localStorage can throw (e.g. disabled cookies / sandboxed iframe).
    return null;
  }
}

/** Store the key in memory; when `persist`, also write it to localStorage. */
export function setKey(key: string, persist = false): void {
  memKey = key;
  const ls = safeLocalStorage();
  if (!ls) return;
  if (persist) {
    try {
      ls.setItem(STORAGE_KEY, key);
    } catch {
      /* quota / disabled — memory still holds it */
    }
  } else {
    // Switching to memory-only should drop any previously persisted copy.
    try {
      ls.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Current key: memory first, then a persisted copy (which is then cached). */
export function getKey(): string | null {
  if (memKey !== null) return memKey;
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const stored = ls.getItem(STORAGE_KEY);
    if (stored) memKey = stored;
    return stored;
  } catch {
    return null;
  }
}

export function hasKey(): boolean {
  return getKey() !== null;
}

/**
 * A key supplied via the environment (.env `OPENAI_API_KEY`, exposed by
 * vite `envPrefix`). When present the UI skips the key-entry card. Dev-only
 * convenience — env keys are baked into the bundle, so don't rely on this for
 * shared deploys.
 */
export function getEnvKey(): string | null {
  try {
    // Dev-only. In a production build `import.meta.env.DEV` is the literal
    // `false`, so the key reference below is dead-code-eliminated and never
    // baked into the shipped bundle.
    if (!import.meta.env?.DEV) return null;
    const k = import.meta.env?.OPENAI_API_KEY;
    return typeof k === 'string' && k.length > 0 ? k : null;
  } catch {
    return null;
  }
}

/** Wipe the key from memory and localStorage. */
export function clearKey(): void {
  memKey = null;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
