// Backend sprite path: ask the API to retexture the template into a sheet
// (keys server-side), fetch the presigned sheet, slice it into per-key frame
// Blobs via the template manifest. The result feeds the same packSprites
// pipeline the BYOK path uses.
import type { Character } from '../engine/schema.ts';
import { collectReferencedSprites } from '../runtime/atlas.ts';
import { detectFrames } from '../creator/image/detectFrames.ts';
import { selectFrames } from '../creator/image/templateManifest.ts';
import type { PixelBox } from '../creator/image/alpha.ts';

async function fetchSheetImageData(
  sheetUrl: string,
): Promise<{ data: Uint8ClampedArray; width: number; height: number; bitmap: ImageBitmap }> {
  const res = await fetch(sheetUrl);
  if (!res.ok) throw new Error(`fetching sprite sheet failed (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement('canvas'), {
          width: bitmap.width,
          height: bitmap.height,
        });
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { data: img.data, width: bitmap.width, height: bitmap.height, bitmap };
}

async function cropToBlob(bitmap: ImageBitmap, box: PixelBox): Promise<Blob> {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(box.w, box.h)
      : Object.assign(document.createElement('canvas'), { width: box.w, height: box.h });
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  if ('convertToBlob' in canvas) return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    ),
  );
}

/**
 * Generate sprite frames for `character` via the backend. Returns spriteKey ->
 * PNG Blob (on the template's black background — packSprites keys it out).
 */
export async function generateSpritesViaBackend(
  baseUrl: string,
  description: string,
  character: Character,
): Promise<Record<string, Blob>> {
  const res = await fetch(`${baseUrl}/generate/sprites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sprite generation failed (${res.status})${text ? `: ${text}` : ''}`);
  }
  const { sheetUrl } = (await res.json()) as { sheetUrl?: string };
  if (!sheetUrl) throw new Error('Sprite generation returned no sheet');

  const { data, width, height, bitmap } = await fetchSheetImageData(sheetUrl);
  const frames = detectFrames(data, width, height, { diffThreshold: 60 });
  if (frames.length === 0) throw new Error('No frames detected in the generated sheet');

  const keys = collectReferencedSprites(character);
  const selected = selectFrames(frames, keys);

  const out: Record<string, Blob> = {};
  for (const [key, box] of Object.entries(selected)) {
    out[key] = await cropToBlob(bitmap, box);
  }
  bitmap.close();
  return out;
}
