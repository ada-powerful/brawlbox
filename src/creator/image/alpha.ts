// Pure pixel math for auto-deriving hurtboxes from generated sprites. No DOM —
// takes raw RGBA bytes, so it's unit-testable.
import type { AABB } from '../../engine/schema.ts';

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Make pixels matching a chroma-key color transparent, in place. Used to cut
 * out a flat backdrop from models that can't emit a transparent background.
 * `tolerance` is a squared-distance radius in RGB space.
 */
export function keyOutChroma(
  rgba: Uint8ClampedArray | Uint8Array | number[],
  color: RGB,
  tolerance = 120,
): void {
  const tol2 = tolerance * tolerance;
  for (let i = 0; i < rgba.length; i += 4) {
    const dr = (rgba[i] ?? 0) - color.r;
    const dg = (rgba[i + 1] ?? 0) - color.g;
    const db = (rgba[i + 2] ?? 0) - color.b;
    if (dr * dr + dg * dg + db * db <= tol2) rgba[i + 3] = 0;
  }
}

/**
 * Reduce chroma "spill": the colored halo a green/magenta backdrop (or grid)
 * leaves on anti-aliased sprite edges after {@link keyOutChroma} cuts the solid
 * fill. The key color's "high" channels (≥128 — green for green-screen; red+blue
 * for magenta) are clamped down to the brightest of its low channels, for
 * still-opaque pixels only. This only ever LOWERS those channels, so it
 * neutralizes the fringe toward a neutral edge without punching holes or shifting
 * genuine character colors much. No-op for keys with no low channel (e.g. white).
 */
export function despillChroma(
  rgba: Uint8ClampedArray | Uint8Array | number[],
  color: RGB,
): void {
  const ch = [color.r, color.g, color.b];
  const spill: number[] = [];
  const keep: number[] = [];
  for (let k = 0; k < 3; k++) (ch[k]! >= 128 ? spill : keep).push(k);
  if (spill.length === 0 || keep.length === 0) return;
  for (let i = 0; i < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) === 0) continue;
    let cap = 0;
    for (const k of keep) cap = Math.max(cap, rgba[i + k] ?? 0);
    for (const k of spill) if ((rgba[i + k] ?? 0) > cap) rgba[i + k] = cap;
  }
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
