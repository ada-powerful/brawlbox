// Local (BYOK / no-backend) character storage via IndexedDB. The mirror of
// store/cloud.ts for when there's no BrawlBox backend: generated characters —
// their JSON, baked atlas PNG, and portrait set — persist in the browser so
// they survive reloads and show up in "My characters" for selection + editing.
// Returns the same CloudCharacter shape the UI consumes; the atlas/portrait
// Blobs are exposed as object URLs (created per list() — a small, bounded leak,
// not revoked because a loaded character may still hold the URL).
import type { Character } from '@/engine/schema.ts';
import type { CloudCharacter } from './cloud.ts';

const DB_NAME = 'brawlbox';
const STORE = 'characters';
const VERSION = 1;

interface LocalRecord {
  characterId: string;
  name: string;
  character: Character;
  createdAt: number;
  archived?: boolean;
  atlas?: Blob;
  front?: Blob;
  back?: Blob;
  headshot?: Blob;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'characterId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const store = db.transaction(STORE, mode).objectStore(STORE);
      const req = run(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

const getRecord = (id: string) => tx<LocalRecord | undefined>('readonly', (s) => s.get(id));

/** All saved characters, newest first, as CloudCharacters with object-URL art. */
export async function listLocalCharacters(): Promise<CloudCharacter[]> {
  const recs = await tx<LocalRecord[]>('readonly', (s) => s.getAll());
  recs.sort((a, b) => b.createdAt - a.createdAt);
  return recs.map((r) => ({
    characterId: r.characterId,
    name: r.name,
    character: r.character,
    createdAt: r.createdAt,
    atlasUrl: r.atlas ? URL.createObjectURL(r.atlas) : undefined,
    portraitFrontUrl: r.front ? URL.createObjectURL(r.front) : undefined,
    portraitBackUrl: r.back ? URL.createObjectURL(r.back) : undefined,
    portraitHeadshotUrl: r.headshot ? URL.createObjectURL(r.headshot) : undefined,
    archived: r.archived,
  }));
}

/**
 * Upsert by character.meta.id. Atlas + portraits are MERGED: when a field isn't
 * supplied (e.g. the pre-sprite save, or an attribute edit on a loaded fighter),
 * the previously stored art is preserved — mirrors the backend's keep-on-absent
 * behavior so a partial save never wipes the baked sprites.
 */
export async function saveLocalCharacter(input: {
  character: Character;
  name: string;
  atlas?: Blob | null;
  portraits?: { front: Blob; back: Blob; headshot: Blob } | null;
}): Promise<void> {
  const id = input.character.meta.id;
  const prev = await getRecord(id);
  const rec: LocalRecord = {
    characterId: id,
    name: input.name,
    character: input.character,
    createdAt: prev?.createdAt ?? Date.now(),
    archived: prev?.archived,
    atlas: input.atlas ?? prev?.atlas,
    front: input.portraits?.front ?? prev?.front,
    back: input.portraits?.back ?? prev?.back,
    headshot: input.portraits?.headshot ?? prev?.headshot,
  };
  await tx('readwrite', (s) => s.put(rec));
}

export async function deleteLocalCharacter(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function renameLocalCharacter(id: string, name: string): Promise<void> {
  const prev = await getRecord(id);
  if (!prev) return;
  prev.name = name;
  prev.character = { ...prev.character, meta: { ...prev.character.meta, name } };
  await tx('readwrite', (s) => s.put(prev));
}

export async function archiveLocalCharacter(id: string, archived: boolean): Promise<void> {
  const prev = await getRecord(id);
  if (!prev) return;
  prev.archived = archived;
  await tx('readwrite', (s) => s.put(prev));
}
