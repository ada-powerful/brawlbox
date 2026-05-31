// Pure pixel math for auto-deriving hurtboxes from generated sprites. No DOM —
// takes raw RGBA bytes, so it's unit-testable.
import type { AABB } from '../../engine/schema.ts';

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Tight bounding box of the non-transparent pixels in an RGBA buffer.
 * `rgba` is row-major, 4 bytes/pixel (the shape of ImageData.data).
 * Returns null when every pixel is below the alpha threshold.
 */
export function alphaBoundingBox(
  rgba: Uint8ClampedArray | Uint8Array | number[],
  width: number,
  height: number,
  threshold = 16,
): PixelBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (alpha > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Map a pixel-space box inside a sprite cell to engine-local AABB coords.
 *
 * The renderer anchors sprites at (0.5, 1.0): cell bottom-center == the
 * character's feet at world origin. Engine AABBs use a bottom-left anchor with
 * x=0 at feet-center, y=0 at feet, +y up. Cell pixels render 1:1 with world
 * units, so the mapping is a translate + y-flip.
 */
export function pixelBoxToLocalAABB(box: PixelBox, cellW: number, cellH: number): AABB {
  return {
    x: box.x - cellW / 2,
    y: cellH - (box.y + box.h),
    w: box.w,
    h: box.h,
  };
}
