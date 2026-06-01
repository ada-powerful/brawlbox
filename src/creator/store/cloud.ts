// Cloud character storage via the BrawlBox API (per-user, auth required).
// Replaces the old IndexedDB store; characters + atlases live server-side
// (DynamoDB + S3) and survive across devices.
import type { Character } from '@/engine/schema.ts';

export interface CloudCharacter {
  characterId: string;
  name: string;
  character: Character;
  createdAt: number;
  /** Presigned GET URL for the atlas PNG (CORS-clean, ~1h). */
  atlasUrl?: string;
  /** Whether this character is published to the public gallery. */
  shared?: boolean;
  /** Whether the owner has archived (hidden) this character. */
  archived?: boolean;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function listCloudCharacters(
  baseUrl: string,
  token: string,
): Promise<CloudCharacter[]> {
  const res = await fetch(`${baseUrl}/characters`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Loading characters failed (${res.status})`);
  return ((await res.json()) as { characters: CloudCharacter[] }).characters;
}

export async function saveCloudCharacter(
  baseUrl: string,
  token: string,
  input: { character: Character; name: string; atlas?: Blob },
): Promise<void> {
  const atlas = input.atlas ? await blobToBase64(input.atlas) : undefined;
  const res = await fetch(`${baseUrl}/characters`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ character: input.character, name: input.name, atlas }),
  });
  if (!res.ok) throw new Error(`Saving failed (${res.status})`);
}

export async function deleteCloudCharacter(
  baseUrl: string,
  token: string,
  characterId: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/characters/${encodeURIComponent(characterId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

/** Rename one of the caller's characters (updates list name + in-game meta.name). */
export async function renameCloudCharacter(
  baseUrl: string,
  token: string,
  characterId: string,
  name: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/characters/${encodeURIComponent(characterId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Rename failed (${res.status})`);
}

/** Soft-archive or restore one of the caller's characters. */
export async function archiveCloudCharacter(
  baseUrl: string,
  token: string,
  characterId: string,
  archived: boolean,
): Promise<void> {
  const res = await fetch(`${baseUrl}/characters/${encodeURIComponent(characterId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) throw new Error(`${archived ? 'Archive' : 'Restore'} failed (${res.status})`);
}

/** Publish/unpublish one of the caller's characters to the public gallery. */
export async function shareCloudCharacter(
  baseUrl: string,
  token: string,
  characterId: string,
  shared: boolean,
): Promise<void> {
  const res = await fetch(`${baseUrl}/characters/${encodeURIComponent(characterId)}/share`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ shared }),
  });
  if (!res.ok) throw new Error(`Share failed (${res.status})`);
}

/** Public gallery — newest shared characters across all users (no auth). */
export async function listGallery(baseUrl: string): Promise<CloudCharacter[]> {
  const res = await fetch(`${baseUrl}/gallery`);
  if (!res.ok) throw new Error(`Loading gallery failed (${res.status})`);
  return ((await res.json()) as { characters: CloudCharacter[] }).characters;
}
