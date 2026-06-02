// Browser-only: slice a retextured template sheet into per-frame-key PNG blobs
// using a FIXED grid (no frame auto-detection). Template sheets like kfm2 lay
// every pose out on an exact cols×rows grid, so each engine sprite key maps to a
// known cell. We crop by FRACTIONAL cell coords (cell / grid size) rather than
// absolute pixels, which makes slicing robust to NB2 returning the retextured
// sheet at a different resolution than the input — as long as it preserves the
// layout (the prompt demands it). The crops then feed the same packSprites
// pipeline the detect-based path uses; packSprites keys out the (green) bg.
import type { PixelBox } from './alpha.ts';

export interface GridTemplateSpec {
  /** Grid dimensions the template's poses are laid out on. */
  cols: number;
  rows: number;
  /** Engine sprite key -> its 0-based cell (col, row) in the grid. */
  cells: Record<string, { col: number; row: number }>;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
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

async function cropToBlob(bitmap: ImageBitmap, box: PixelBox): Promise<Blob> {
  const canvas = makeCanvas(box.w, box.h);
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return canvasToBlob(canvas);
}

/** The cell rectangle (in `bitmap` pixels) for a grid cell, fractional → px. */
export function cellBox(
  bitmap: { width: number; height: number },
  spec: GridTemplateSpec,
  col: number,
  row: number,
): PixelBox {
  const cellW = bitmap.width / spec.cols;
  const cellH = bitmap.height / spec.rows;
  return {
    x: Math.round(col * cellW),
    y: Math.round(row * cellH),
    w: Math.round(cellW),
    h: Math.round(cellH),
  };
}

/**
 * Crop the cell for each requested sprite `key` out of `bitmap`. Keys not in the
 * spec's cell map are skipped (the caller falls back to whatever it had).
 * Returns spriteKey -> PNG Blob (still on the green background — packSprites
 * keys it out after).
 */
export async function sliceGridSheet(
  bitmap: ImageBitmap,
  spec: GridTemplateSpec,
  keys: string[],
): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {};
  for (const key of keys) {
    const cell = spec.cells[key];
    if (!cell) continue;
    out[key] = await cropToBlob(bitmap, cellBox(bitmap, spec, cell.col, cell.row));
  }
  return out;
}
