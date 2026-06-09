// BYOK key storage. In-memory by default; opt-in localStorage persistence.
// The key never leaves the browser except to the model provider (commitment 3b.7).
// Module-level state is fine here — the no-module-state rule applies to engine/ only.
const STORAGE_KEY = 'ftg.apiKey.openai';
const STORAGE_KEY_FAL = 'ftg.apiKey.fal';

let memKey: string | null = null;
let memFalKey: string | null = null;

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

// --- fal.ai key (BYOK) ---------------------------------------------------
// The fal key drives local portrait + sprite-sheet generation (nano-banana-2).
// Same memory-first / opt-in-persist contract as the OpenAI key; never leaves
// the browser except to fal.ai.

/** Store the fal key in memory; when `persist`, also write it to localStorage. */
export function setFalKey(key: string, persist = false): void {
  memFalKey = key;
  const ls = safeLocalStorage();
  if (!ls) return;
  if (persist) {
    try {
      ls.setItem(STORAGE_KEY_FAL, key);
    } catch {
      /* quota / disabled — memory still holds it */
    }
  } else {
    try {
      ls.removeItem(STORAGE_KEY_FAL);
    } catch {
      /* ignore */
    }
  }
}

/** Current fal key: memory first, then a persisted copy (which is then cached). */
export function getFalKey(): string | null {
  if (memFalKey !== null) return memFalKey;
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const stored = ls.getItem(STORAGE_KEY_FAL);
    if (stored) memFalKey = stored;
    return stored;
  } catch {
    return null;
  }
}

/**
 * A fal key supplied via the environment (.env `FAL_API_Key`, exposed by vite's
 * `FAL_` envPrefix). Dev-only — env keys are baked into the bundle, so don't
 * rely on this for shared deploys. Returns null in production builds.
 */
export function getEnvFalKey(): string | null {
  try {
    if (!import.meta.env?.DEV) return null;
    const k = (import.meta.env as Record<string, unknown> | undefined)?.FAL_API_Key;
    return typeof k === 'string' && k.length > 0 ? k : null;
  } catch {
    return null;
  }
}

/** Wipe the fal key from memory and localStorage. */
export function clearFalKey(): void {
  memFalKey = null;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY_FAL);
  } catch {
    /* ignore */
  }
}
