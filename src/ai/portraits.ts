// Client for the character-portrait endpoint: send ONE reference image (a
// headshot or full-body photo the user uploaded) and get back consistent
// front + back full-body views and a headshot (NB2-generated, white bg).
// front+back then feed the action-sheet retexture so every pose stays on-model.
import { falEdit } from './fal.ts';

export interface PortraitSet {
  front: string;
  back: string;
  headshot: string;
  keys?: { front: string; back: string; headshot: string };
  /**
   * Raw blobs (BYOK/local path only). Kept so the sprite re-skin can re-feed the
   * front/back portraits to nano-banana-2 inline (the display fields are blob:
   * object URLs, which fal's servers can't fetch). Absent on the backend path,
   * which uses presigned S3 URLs that fal can fetch directly.
   */
  blobs?: { front: Blob; back: Blob; headshot: Blob };
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

/**
 * BYOK variant of {@link generatePortraits}: generates the front/back/headshot
 * set in the browser via nano-banana-2 with the user's own fal key — no backend,
 * no S3. `front` is made first (the canonical look), then back + headshot are
 * derived from it in parallel so they stay consistent. Returns blob: object URLs
 * for display plus the raw blobs (for the inline sprite re-skin).
 */
export async function generatePortraitsBYOK(
  falKey: string,
  image: string,
  description: string,
  onStatus?: (status: string) => void,
): Promise<PortraitSet> {
  const desc = description ? ` (${description})` : '';
  const fal = { falKey, outputFormat: 'png' as const, safetyTolerance: '6', onStatus };

  const front = await falEdit(
    [image],
    `A clean full-body character reference of the subject in the image${desc}. Front view, ` +
      `facing the camera, standing straight in a neutral relaxed pose, full body from head to toe, ` +
      `centered, on a plain solid pure-white studio background. Faithfully preserve the subject's ` +
      `face, hairstyle, outfit, colors and body proportions. Sharp, well-lit, no text, no props.`,
    { ...fal, resolution: '2K', aspectRatio: '3:4' },
  );

  const [back, headshot] = await Promise.all([
    falEdit(
      [image, front],
      `Full-body standing BACK view of the exact same character shown in the images${desc}. Seen ` +
        `directly from behind (back of the head and body), standing straight, full body head to toe, ` +
        `centered, on a plain solid pure-white studio background. Identical outfit, hair, colors and ` +
        `proportions as the front view. Sharp, well-lit, no text.`,
      { ...fal, resolution: '2K', aspectRatio: '3:4' },
    ),
    falEdit(
      [front],
      `Formal head-and-shoulders headshot portrait of the same character${desc}. Front-facing, ` +
        `friendly neutral expression, centered, on a plain solid pure-white studio background. ` +
        `Preserve the face, hairstyle and colors exactly. Sharp, well-lit, no text.`,
      { ...fal, resolution: '2K', aspectRatio: '1:1' },
    ),
  ]);

  return {
    front: URL.createObjectURL(front),
    back: URL.createObjectURL(back),
    headshot: URL.createObjectURL(headshot),
    blobs: { front, back, headshot },
  };
}
