// IndexedDB persistence for generated characters. A stored character is fully
// self-contained (Character JSON + atlas PNG Blob), so it reloads offline with
// zero network calls (architectural commitment 3b.8).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Character } from '../../engine/schema.ts';

export interface StoredCharacter {
  id: string;
  name: string;
  character: Character;
  atlas: Blob;
  createdAt: number; // epoch ms, stamped at save time (outside the engine)
}

interface FtgDB extends DBSchema {
  characters: { key: string; value: StoredCharacter };
}

// Lazy-open so importing this module never touches indexedDB (which is absent
// in node/SSR). The promise is created on first real use, in the browser.
let dbPromise: Promise<IDBPDatabase<FtgDB>> | null = null;
function db(): Promise<IDBPDatabase<FtgDB>> {
  return (dbPromise ??= openDB<FtgDB>('ftg', 1, {
    upgrade(database) {
      database.createObjectStore('characters', { keyPath: 'id' });
    },
  }));
}

export async function saveCharacter(record: StoredCharacter): Promise<void> {
  await (await db()).put('characters', record);
}

export async function getCharacter(id: string): Promise<StoredCharacter | undefined> {
  return (await db()).get('characters', id);
}

export async function listCharacters(): Promise<StoredCharacter[]> {
  const all = await (await db()).getAll('characters');
  return all.sort((a, b) => b.createdAt - a.createdAt); // newest first
}

export async function deleteCharacter(id: string): Promise<void> {
  await (await db()).delete('characters', id);
}
