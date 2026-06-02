// Client for the character-portrait endpoint: send ONE reference image (a
// headshot or full-body photo the user uploaded) and get back consistent
// front + back full-body views and a headshot (NB2-generated, white bg).
// front+back then feed the action-sheet retexture so every pose stays on-model.

export interface PortraitSet {
  front: string;
  back: string;
  headshot: string;
  keys?: { front: string; back: string; headshot: string };
}

/**
 * Decode `file`, downscale so the longest side is ≤ `maxDim`, and return a JPEG
 * data URI. Keeps the upload small enough to send in the request body (NB2 only
 * needs a reference, not full resolution) and strips EXIF/orientation surprises.
 */
export async function fileToDataUri(file: File, maxDim = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Generate the front/back/headshot portrait set from one reference image. */
export async function generatePortraits(
  baseUrl: string,
  image: string,
  description: string,
  token?: string | null,
): Promise<PortraitSet> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/generate/portraits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image, description }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Portrait generation failed (${res.status})${text ? `: ${text}` : ''}`);
  }
  return (await res.json()) as PortraitSet;
}
