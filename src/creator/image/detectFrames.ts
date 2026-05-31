// Pure auto-segmentation of a sprite sheet into frame rectangles. Template
// sheets sit on a flat dark background with gaps between frames; we project
// content onto the axes to find row bands, split each band into columns at the
// gaps, then tighten each cell to its content. No DOM — unit-testable.
import { alphaBoundingBox, type PixelBox, type RGB } from './alpha.ts';

export interface DetectOptions {
  /**
   * Page background color (the gaps between frame cells). Defaults to the
   * top-left corner pixel. Frames are detected as regions that differ from it,
   * which works whether cells are dark-on-white or bright-on-black.
   */
  bgColor?: RGB;
  /** Sum-of-abs-channel-diff from bg above which a pixel counts as content. */
  diffThreshold?: number;
  /** Ignore rows/cols whose content-pixel count is below this (speckle guard). */
  minContentPixels?: number;
  /** Drop detected frames smaller than these. */
  minFrameW?: number;
  minFrameH?: number;
}

type RGBA = Uint8ClampedArray | Uint8Array | number[];

function isContent(rgba: RGBA, idx: number, bg: RGB, diff: number): boolean {
  if ((rgba[idx + 3] ?? 0) <= 8) return false;
  const dr = Math.abs((rgba[idx] ?? 0) - bg.r);
  const dg = Math.abs((rgba[idx + 1] ?? 0) - bg.g);
  const db = Math.abs((rgba[idx + 2] ?? 0) - bg.b);
  return dr + dg + db > diff;
}

/** Maximal runs of indices where `has[i]` is true, within [0,len). */
function runs(has: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < has.length; i++) {
    if (has[i] && start === -1) start = i;
    else if (!has[i] && start !== -1) {
      out.push([start, i]);
      start = -1;
    }
  }
  if (start !== -1) out.push([start, has.length]);
  return out;
}

/**
 * Detect frame rectangles, ordered top-to-bottom then left-to-right. A future
 * editor lets the user nudge these; the engine pose-key mapping is applied
 * separately (per-template manifest).
 */
export function detectFrames(
  rgba: RGBA,
  width: number,
  height: number,
  opts: DetectOptions = {},
): PixelBox[] {
  const bg: RGB = opts.bgColor ?? { r: rgba[0] ?? 0, g: rgba[1] ?? 0, b: rgba[2] ?? 0 };
  const diff = opts.diffThreshold ?? 90;
  const minPx = opts.minContentPixels ?? 1;
  const minW = opts.minFrameW ?? 4;
  const minH = opts.minFrameH ?? 4;

  // Row projection -> horizontal bands.
  const rowHas: boolean[] = new Array(height).fill(false);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (isContent(rgba, (y * width + x) * 4, bg, diff)) count++;
    }
    rowHas[y] = count >= minPx;
  }

  const frames: PixelBox[] = [];
  for (const [y0, y1] of runs(rowHas)) {
    // Column projection within this band -> frame columns.
    const colHas: boolean[] = new Array(width).fill(false);
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let y = y0; y < y1; y++) {
        if (isContent(rgba, (y * width + x) * 4, bg, diff)) count++;
      }
      colHas[x] = count >= minPx;
    }

    for (const [x0, x1] of runs(colHas)) {
      // Tighten the cell to its content bbox so frames are snug.
      const cellW = x1 - x0;
      const cellH = y1 - y0;
      const cell = new Uint8ClampedArray(cellW * cellH * 4);
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const s = ((y0 + y) * width + (x0 + x)) * 4;
          const d = (y * cellW + x) * 4;
          // Re-encode as alpha so alphaBoundingBox can find content.
          cell[d + 3] = isContent(rgba, s, bg, diff) ? 255 : 0;
        }
      }
      const box = alphaBoundingBox(cell, cellW, cellH, 0);
      if (!box) continue;
      const frame = { x: x0 + box.x, y: y0 + box.y, w: box.w, h: box.h };
      if (frame.w >= minW && frame.h >= minH) frames.push(frame);
    }
  }
  return frames;
}
