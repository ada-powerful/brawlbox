// Browser-only: draw generated sprite Blobs into one atlas PNG and derive a
// body hurtbox per frame from its alpha. The layout + pixel math are imported
// from the pure (tested) modules; this file only does canvas I/O.
import type { AABB, FrameRect } from '../../engine/schema.ts';
import {
  alphaBoundingBox,
  despillChroma,
  isGreenScreen,
  keyOutChroma,
  keyOutGreenScreen,
  pixelBoxToLocalAABB,
  type RGB,
} from './alpha.ts';
import { gridLayout } from './pack.ts';

export interface PackOptions {
  /** Uniform cell size each source image is downscaled into. */
  cellW?: number;
  cellH?: number;
  /** Alpha cutoff for the hurtbox bounding box. */
  alphaThreshold?: number;
  /** When set, key out this background color (for non-transparent models). */
  chromaKey?: RGB;
  /** Extra colors to key out too (e.g. a magenta cell grid alongside green bg). */
  extraChroma?: RGB[];
  chromaTolerance?: number;
  /** Also neutralize the key colors' anti-alias spill on sprite edges. */
  despill?: boolean;
  /** Size the shared scale off a high percentile (not the max) so one oversized
   * crop can't shrink every sprite; outliers are clamped to fit per-frame. */
  robustScale?: boolean;
}

export interface PackedAtlas {
  atlasBlob: Blob;
  frames: Record<string, FrameRect>;
  hurtboxes: Record<string, AABB>;
  cellW: number;
  cellH: number;
}

function makeCanvas(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement } {
  if (typeof OffscreenCanvas !== 'undefined') return { canvas: new OffscreenCanvas(w, h) };
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas };
}

// Encode the atlas as WebP (alpha-preserving, ~7× smaller than PNG). A 4K-sourced
// 240px-cell atlas is ~7MB as PNG — too big to round-trip as base64 in the
// /characters save body (it silently fails the request-payload limit, so the
// atlas never persists → the saved fighter loads as a silhouette). WebP q0.92
// brings it to ~1MB with no visible quality loss. `loadAtlasTextures` forces the
// texture parser (decodes by sniffing bytes, not extension), so WebP loads from
// both the in-session blob URL and the presigned S3 URL.
const ATLAS_TYPE = 'image/webp';
const ATLAS_QUALITY = 0.92;
async function toBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas)
    return canvas.convertToBlob({ type: ATLAS_TYPE, quality: ATLAS_QUALITY });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      ATLAS_TYPE,
      ATLAS_QUALITY,
    ),
  );
}

/**
 * Pack a map of spriteKey -> PNG Blob into a single atlas. Each image is
 * downscaled into a uniform cell; the non-transparent bounds of each cell
 * become that frame's body hurtbox (in engine-local coords).
 */
export async function packSprites(
  images: Record<string, Blob>,
  options: PackOptions = {},
): Promise<PackedAtlas> {
  const cellW = options.cellW ?? 160;
  const cellH = options.cellH ?? 160;
  const threshold = options.alphaThreshold ?? 16;

  const keys = Object.keys(images).sort();
  const layout = gridLayout(keys, cellW, cellH);

  const { canvas } = makeCanvas(layout.width, layout.height);
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = true;

  const hurtboxes: Record<string, AABB> = {};

  // Decode every frame up front so we can derive ONE scale factor shared across
  // all of them. Frames arrive tightly cropped to their own content, so scaling
  // each independently to fill the cell would normalize away the relative size
  // the poses shared in the source sheet — a wide running crop would shrink
  // (width-limited) while a tall standing crop fills the cell, making the
  // character balloon and shrink frame to frame. A single scale keeps the
  // tallest/widest frame filling the cell and every other pose proportional.
  const bitmaps: Record<string, ImageBitmap> = {};
  for (const key of keys) bitmaps[key] = await createImageBitmap(images[key]!);

  // Reference size for the shared scale. Normally the max frame, so the biggest
  // pose fills the cell and the rest stay proportional. But a single bad crop
  // (e.g. detection merged two poses into one over-wide frame) would then shrink
  // EVERY sprite. `robustScale` instead references a high percentile, so a few
  // outliers don't dominate — they're clamped to fit per-frame below.
  const pct = (vals: number[], p: number): number => {
    const s = [...vals].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] ?? 1;
  };
  const ws = keys.map((k) => bitmaps[k]!.width);
  const hs = keys.map((k) => bitmaps[k]!.height);
  const p = options.robustScale ? 0.9 : 1;
  const refW = Math.max(1, pct(ws, p));
  const refH = Math.max(1, pct(hs, p));
  const scale = Math.min(cellW / refW, cellH / refH);

  for (const key of keys) {
    const rect = layout.frames[key]!;
    const bitmap = bitmaps[key]!;
    // Shared scale, but never let an oversized frame overflow its cell (clamps
    // only the outliers; for the normal range this equals `scale`). Anchored to
    // the cell's bottom-center so the character's feet line up with (0.5, 1).
    const ds = Math.min(scale, cellW / bitmap.width, cellH / bitmap.height);
    const dw = bitmap.width * ds;
    const dh = bitmap.height * ds;
    ctx.drawImage(bitmap, rect.x + (cellW - dw) / 2, rect.y + (cellH - dh), dw, dh);
    bitmap.close();

    const cell = ctx.getImageData(rect.x, rect.y, cellW, cellH);
    if (options.chromaKey) {
      const tol = options.chromaTolerance ?? 120;
      const colors = [options.chromaKey, ...(options.extraChroma ?? [])];
      for (const c of colors) keyOutChroma(cell.data, c, tol);
      // A green backdrop also bleeds olive/muddy spill the fixed key misses;
      // clear every green-dominant pixel so it isn't baked into the frame.
      if (isGreenScreen(options.chromaKey.r, options.chromaKey.g, options.chromaKey.b)) {
        keyOutGreenScreen(cell.data);
      }
      if (options.despill) for (const c of colors) despillChroma(cell.data, c);
      ctx.putImageData(cell, rect.x, rect.y); // bake the cutout into the atlas
    }

    const box = alphaBoundingBox(cell.data, cellW, cellH, threshold);
    // Fall back to the full cell if a frame somehow came back blank.
    hurtboxes[key] = box
      ? pixelBoxToLocalAABB(box, cellW, cellH)
      : { x: -cellW / 2, y: 0, w: cellW, h: cellH };
  }

  return { atlasBlob: await toBlob(canvas), frames: layout.frames, hurtboxes, cellW, cellH };
}
