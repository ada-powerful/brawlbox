// Maps detected template-sheet frames to engine sprite keys. The fal retexture
// preserves the template's ROW layout, so we map by (row index, fractional
// position within the row) rather than absolute frame index — robust to the
// per-row frame-count jitter that auto-detection produces run to run.
import type { PixelBox } from './alpha.ts';

export interface FrameSelector {
  /** 0-based row, top to bottom. */
  row: number;
  /** Position within the row, 0 (first) .. 1 (last). */
  frac: number;
}

// Layout of the default MUGEN action template (rows top→bottom):
// 0 idle · 1 walk-fwd · 2 walk-back · 3 jump · 4 jump-move · 5 crouch-down
// 6 crouch · 7 roundhouse kick · 8 punch/dash · 9 attack · 10 hit · 11 knockdown
// 12 lying + props
export const DEFAULT_TEMPLATE_MANIFEST: Record<string, FrameSelector> = {
  stand: { row: 0, frac: 0 },
  'walk-0': { row: 1, frac: 0 },
  'walk-1': { row: 1, frac: 0.25 },
  // Row 4 is the airborne (moving) jump — fuller poses than the standing leap (row 3).
  'jump-rise': { row: 4, frac: 0.2 },
  'jump-fall': { row: 4, frac: 0.7 },
  'punch-startup': { row: 7, frac: 0 },
  'punch-active': { row: 7, frac: 0.5 },
  'punch-recovery': { row: 7, frac: 0.85 },
  'hit-stand': { row: 10, frac: 0 },
  'hit-air': { row: 11, frac: 0 },
  ko: { row: 11, frac: 0.95 },
};

/**
 * Group detected frames (ordered top→bottom, left→right) into rows by their
 * y position. A new row starts when a frame's top jumps well past the current
 * row's top.
 */
export function groupIntoRows(frames: PixelBox[]): PixelBox[][] {
  const rows: PixelBox[][] = [];
  let rowTop = -Infinity;
  // Threshold = a fraction of the median frame height (rows are ~1 frame apart).
  const heights = frames.map((f) => f.h).sort((a, b) => a - b);
  const medianH = heights.length ? (heights[Math.floor(heights.length / 2)] ?? 0) : 0;
  const threshold = Math.max(20, medianH * 0.5);

  for (const f of frames) {
    if (f.y > rowTop + threshold || rows.length === 0) {
      rows.push([f]);
      rowTop = f.y;
    } else {
      rows[rows.length - 1]!.push(f);
    }
  }
  // Keep each row left-to-right.
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * Pick a PixelBox for each requested engine sprite key using the manifest.
 * Falls back to the stand frame (row 0, first) when a selector's row is
 * missing or a key isn't in the manifest.
 */
export function selectFrames(
  detected: PixelBox[],
  keys: string[],
  manifest: Record<string, FrameSelector> = DEFAULT_TEMPLATE_MANIFEST,
): Record<string, PixelBox> {
  const rows = groupIntoRows(detected);
  const fallback = rows[0]?.[0] ?? detected[0];

  const pick = (sel: FrameSelector | undefined): PixelBox | undefined => {
    if (!sel) return fallback;
    const row = rows[sel.row];
    if (!row || row.length === 0) return fallback;
    const idx = Math.min(row.length - 1, Math.max(0, Math.round(sel.frac * (row.length - 1))));
    return row[idx];
  };

  const out: Record<string, PixelBox> = {};
  for (const key of keys) {
    const box = pick(manifest[key]);
    if (box) out[key] = box;
  }
  return out;
}
