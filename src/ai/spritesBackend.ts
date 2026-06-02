// Backend sprite path: ask the API to retexture the template into a sheet
// (keys server-side), fetch the presigned sheet, detect its frames, and map
// each engine sprite key to a detected frame via the template manifest. The
// per-key crops feed the same packSprites pipeline the BYOK path uses.
//
// M2.3 splits this into reviewable steps so the frame-review console can show
// the sheet + detected frames and let the user re-map a mis-detected pose:
//   1. fetchSheetAndDetect → sheet image + detected frames + default selection
//   2. (user optionally edits the selection in the console)
//   3. cropSelection → per-key Blobs → packSprites (unchanged)
import type { Character } from '../engine/schema.ts';
import { collectReferencedSprites } from '../runtime/atlas.ts';
import { detectFrames } from '../creator/image/detectFrames.ts';
import { selectFrameIndices } from '../creator/image/templateManifest.ts';
import type { PixelBox, RGB } from '../creator/image/alpha.ts';

/** A fetched retextured sheet: decoded bitmap + its sampled background color. */
export interface FetchedSheet {
  /** Object URL of the fetched sheet PNG — for display. Caller must revoke it. */
  sheetUrl: string;
  /** Decoded sheet, kept for cropping. Caller must close() it when done. */
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /**
   * The sheet's background color, sampled from the top-left pixel. Whatever flat
   * backdrop NB2 produced (green for the green-screen templates) — pass it as
   * packSprites' chromaKey so the cutout adapts instead of assuming one color.
   */
  bg: RGB;
}

/** A retextured sheet plus everything the review console needs to edit it. */
export interface DetectedSheet extends FetchedSheet {
  /** Detected frame rects, in detection order (top→bottom, left→right). */
  frames: PixelBox[];
  /** spriteKey -> index into `frames`. The default mapping; user-editable. */
  selection: Record<string, number>;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

function context2d(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas)
    return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    ),
  );
}

function imageDataFor(bitmap: ImageBitmap): Uint8ClampedArray {
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = context2d(canvas);
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

async function cropToBlob(bitmap: ImageBitmap, box: PixelBox): Promise<Blob> {
  const canvas = makeCanvas(box.w, box.h);
  const ctx = context2d(canvas);
  ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return canvasToBlob(canvas);
}

/** Sample the top-left pixel as the sheet's flat background color (cheap 1×1). */
function sampleCorner(bitmap: ImageBitmap): RGB {
  const canvas = makeCanvas(1, 1);
  const ctx = context2d(canvas);
  ctx.drawImage(bitmap, 0, 0, 1, 1, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0 };
}

/**
 * POST the description to the backend and fetch the retextured sheet. `templateKey`
 * selects which preset layout sheet the backend retextures (defaults server-side).
 * The caller owns `sheetUrl` (revoke) and `bitmap` (close).
 */
export async function fetchSheetBitmap(
  baseUrl: string,
  description: string,
  token?: string | null,
  templateKey?: string,
): Promise<FetchedSheet> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/generate/sprites`, {
    method: 'POST',
    headers,
    body: JSON.stringify(templateKey ? { description, templateKey } : { description }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sprite generation failed (${res.status})${text ? `: ${text}` : ''}`);
  }
  const { sheetUrl: presigned } = (await res.json()) as { sheetUrl?: string };
  if (!presigned) throw new Error('Sprite generation returned no sheet');

  const sheetRes = await fetch(presigned);
  if (!sheetRes.ok) throw new Error(`fetching sprite sheet failed (${sheetRes.status})`);
  const blob = await sheetRes.blob();
  const bitmap = await createImageBitmap(blob);
  return {
    sheetUrl: URL.createObjectURL(blob),
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    bg: sampleCorner(bitmap),
  };
}

/**
 * Fetch a retextured sheet (detect-based path), auto-segment its frames, and
 * compute the default spriteKey→frame mapping for `character`. Returns
 * everything the review console needs. Used by the legacy "freeform" template;
 * fixed-grid templates use {@link fetchSheetBitmap} + sliceGridSheet instead.
 */
export async function fetchSheetAndDetect(
  baseUrl: string,
  description: string,
  character: Character,
  token?: string | null,
  templateKey?: string,
): Promise<DetectedSheet> {
  const fetched = await fetchSheetBitmap(baseUrl, description, token, templateKey);
  const frames = detectFrames(imageDataFor(fetched.bitmap), fetched.width, fetched.height, {
    diffThreshold: 60,
    bgColor: fetched.bg,
  });
  if (frames.length === 0) {
    fetched.bitmap.close();
    URL.revokeObjectURL(fetched.sheetUrl);
    throw new Error('No frames detected in the generated sheet');
  }

  const keys = collectReferencedSprites(character);
  const selection = selectFrameIndices(frames, keys);
  return { ...fetched, frames, selection };
}

/**
 * Crop the chosen frame for each sprite key into a PNG Blob (on the template's
 * black background — packSprites keys it out). Skips keys whose selected index
 * is out of range.
 */
export async function cropSelection(
  bitmap: ImageBitmap,
  frames: PixelBox[],
  selection: Record<string, number>,
): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {};
  for (const [key, index] of Object.entries(selection)) {
    const box = frames[index];
    if (box) out[key] = await cropToBlob(bitmap, box);
  }
  return out;
}

/**
 * One-shot convenience: generate, detect, and crop with the default mapping.
 * Returns spriteKey -> PNG Blob. The review console uses the granular calls
 * above instead so it can show and edit the selection.
 */
export async function generateSpritesViaBackend(
  baseUrl: string,
  description: string,
  character: Character,
  token?: string | null,
): Promise<Record<string, Blob>> {
  const sheet = await fetchSheetAndDetect(baseUrl, description, character, token);
  try {
    return await cropSelection(sheet.bitmap, sheet.frames, sheet.selection);
  } finally {
    sheet.bitmap.close();
    URL.revokeObjectURL(sheet.sheetUrl);
  }
}
