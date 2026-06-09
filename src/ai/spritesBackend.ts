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
import { falEdit } from './fal.ts';

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
  /** Front/back portrait URLs to use as the look reference (else gpt-image). */
  refs?: { frontUrl?: string; backUrl?: string },
): Promise<FetchedSheet> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body: Record<string, string> = { description };
  if (templateKey) body.templateKey = templateKey;
  if (refs?.frontUrl && refs.backUrl) {
    body.frontUrl = refs.frontUrl;
    body.backUrl = refs.backUrl;
  }
  const res = await fetch(`${baseUrl}/generate/sprites`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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
 * BYOK variant of {@link fetchSheetBitmap}: re-skins a bundled green-screen
 * template sheet into the described character entirely in the browser via
 * nano-banana-2 (the user's fal key), using their front+back portraits as the
 * look reference. No backend, no S3. Returns the same {@link FetchedSheet} shape
 * the slicer consumes. Mirrors the server prompt in brawlbox-api `sprites.ts`.
 */
export async function reskinTemplateBYOK(
  falKey: string,
  templateSheetUrl: string,
  description: string,
  // Front+back portraits (photo flow) keep poses on-model from both sides; a
  // single reference (attributes flow, no photo) is fine when there's no back.
  refs: { front: Blob; back: Blob } | { reference: Blob },
  onStatus?: (status: string) => void,
): Promise<FetchedSheet> {
  const templateRes = await fetch(templateSheetUrl);
  if (!templateRes.ok) throw new Error(`loading template sheet failed (${templateRes.status})`);
  const template = await templateRes.blob();

  const usePortraits = 'front' in refs;
  const refImages = usePortraits ? [refs.front, refs.back] : [refs.reference];
  const refClause = usePortraits
    ? `The remaining images are FRONT and BACK reference views of one character. Repaint EVERY ` +
      `pose/frame so the character matches those references exactly (use the back view for poses ` +
      `seen from behind)`
    : `The second image is a different character. Repaint EVERY pose/frame so the character looks ` +
      `exactly like it`;

  const GREEN = 'solid flat chroma-green (#00FF00) background';
  const prompt =
    `The first image is a 2D fighting-game sprite sheet showing one character in many poses on a ` +
    `${GREEN}. ${refClause} (${description}), while preserving the EXACT sheet layout: same frame ` +
    `positions, same poses, same sizes, and the same ${GREEN} between and around every pose. Output ` +
    `the sheet at the SAME canvas dimensions and aspect ratio as the first image, with every pose ` +
    `kept in its original grid cell — do NOT crop, pad, resize, rotate, or rearrange the layout. Do ` +
    `not use that background color anywhere on the character. Each pose contains ONLY the lone ` +
    `character figure: repaint exactly what the source frame already draws (body, hair, clothing, ` +
    `skin) and leave the rest of the cell as plain background. Render EVERY pose PHOTOREALISTICALLY ` +
    `— real skin/fabric/material textures, natural lighting and shading that match the reference; do ` +
    `NOT keep the source sheet's flat 2D game-art look. Render each pose as a tack-sharp, in-focus ` +
    `frozen still with clean, crisp figure edges. Fill the whole background — between and around ` +
    `every pose — with one perfectly flat, even, solid chroma-green (#00FF00), identical across the ` +
    `entire sheet, meeting the character at a clean hard edge.`;

  const sheet = await falEdit([template, ...refImages], prompt, {
    falKey,
    resolution: '4K',
    aspectRatio: 'auto',
    safetyTolerance: '6',
    outputFormat: 'png',
    onStatus,
  });
  const bitmap = await createImageBitmap(sheet);
  return {
    sheetUrl: URL.createObjectURL(sheet),
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
