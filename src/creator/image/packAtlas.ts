// Browser-only: draw generated sprite Blobs into one atlas PNG and derive a
// body hurtbox per frame from its alpha. The layout + pixel math are imported
// from the pure (tested) modules; this file only does canvas I/O.
import type { AABB, FrameRect } from '../../engine/schema.ts';
import {
  alphaBoundingBox,
  despillChroma,
  keyOutChroma,
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
  chromaTolerance?: number;
  /** Also neutralize the key color's anti-alias spill on sprite edges. */
  despill?: boolean;
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

async function toBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
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
  let maxW = 1;
  let maxH = 1;
  for (const key of keys) {
    const bitmap = await createImageBitmap(images[key]!);
    bitmaps[key] = bitmap;
    if (bitmap.width > maxW) maxW = bitmap.width;
    if (bitmap.height > maxH) maxH = bitmap.height;
  }
  const scale = Math.min(cellW / maxW, cellH / maxH);

  for (const key of keys) {
    const rect = layout.frames[key]!;
    const bitmap = bitmaps[key]!;
    // Draw at the shared scale, anchored to the cell's bottom-center so the
    // character's feet line up with the (0.5, 1) sprite anchor.
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    ctx.drawImage(bitmap, rect.x + (cellW - dw) / 2, rect.y + (cellH - dh), dw, dh);
    bitmap.close();

    const cell = ctx.getImageData(rect.x, rect.y, cellW, cellH);
    if (options.chromaKey) {
      keyOutChroma(cell.data, options.chromaKey, options.chromaTolerance ?? 120);
      if (options.despill) despillChroma(cell.data, options.chromaKey);
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
