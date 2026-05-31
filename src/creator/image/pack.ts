// Pure atlas layout math. The actual canvas drawing lives in packAtlas.ts
// (browser-only); this computes where each frame goes so it can be tested.
import type { FrameRect } from '../../engine/schema.ts';

export interface GridLayout {
  frames: Record<string, FrameRect>;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

/**
 * Lay out `keys` into a uniform grid of cellW x cellH cells, `cols` per row
 * (defaults to a roughly-square grid). Frame order follows `keys` order, which
 * the caller keeps stable (collectReferencedSprites is sorted).
 */
export function gridLayout(
  keys: string[],
  cellW: number,
  cellH: number,
  cols = Math.ceil(Math.sqrt(keys.length)),
): GridLayout {
  const columns = Math.max(1, cols);
  const rows = Math.max(1, Math.ceil(keys.length / columns));
  const frames: Record<string, FrameRect> = {};
  keys.forEach((key, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    frames[key] = { x: col * cellW, y: row * cellH, w: cellW, h: cellH };
  });
  return { frames, width: columns * cellW, height: rows * cellH, cols: columns, rows };
}
