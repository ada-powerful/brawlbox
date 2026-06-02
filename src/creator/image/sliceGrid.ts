// Browser-only: slice a retextured template sheet into per-frame-key PNG blobs
// using a FIXED grid (no whole-sheet frame auto-detection). Template sheets like
// kfm2 lay every pose out on an exact cols×rows grid, so each engine sprite key
// maps to a known cell. We crop by FRACTIONAL cell coords (cell / grid size) so
// slicing is robust to NB2 returning the sheet at a different resolution/aspect
// than the input.
//
// Within each cell we DON'T trust the pose to fill the cell exactly: NB2 repaints
// each pose at its own offset/size inside the cell, so cropping the raw cell would
// leave the character floating (mis-anchored feet, the "切割角度不对" symptom). So
// we key out the background inside the cell, find the pose's tight content box, and
// crop to THAT — recentered, ready for packSprites' shared-scale + bottom anchor.
import { alphaBoundingBox, keyOutChroma, type PixelBox, type RGB } from './alpha.ts';

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

function ctx2d(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = (canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true }) as
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

async function cropToBlob(bitmap: ImageBitmap, box: PixelBox): Promise<Blob> {
  const canvas = makeCanvas(box.w, box.h);
  ctx2d(canvas).drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
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
 * Find the pose's tight content box inside `cell` by keying out the background
 * color and bounding the remaining pixels. Returned in `bitmap` pixel coords.
 * Null when the cell is effectively empty (no pose drawn there).
 */
function contentBox(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  cell: PixelBox,
  bg: RGB,
): PixelBox | null {
  ctx.clearRect(0, 0, cell.w, cell.h);
  ctx.drawImage(bitmap, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
  const img = ctx.getImageData(0, 0, cell.w, cell.h);
  keyOutChroma(img.data, bg, 110); // background → alpha 0
  const bb = alphaBoundingBox(img.data, cell.w, cell.h, 16);
  if (!bb) return null;
  // A couple px of slack so anti-aliased edges aren't shaved.
  const pad = 2;
  const x = Math.max(0, bb.x - pad);
  const y = Math.max(0, bb.y - pad);
  const w = Math.min(cell.w - x, bb.w + 2 * pad);
  const h = Math.min(cell.h - y, bb.h + 2 * pad);
  return { x: cell.x + x, y: cell.y + y, w, h };
}

/**
 * Crop the tight pose for each requested sprite `key` out of `bitmap`. `bg` is
 * the sheet's background color (auto-sampled by the caller) used to find each
 * pose's content box within its cell. Keys absent from the spec are skipped;
 * a cell with no detectable content falls back to the whole cell so the atlas
 * still covers the key. Returns spriteKey -> PNG Blob (still on the background;
 * packSprites keys it out again).
 */
export async function sliceGridSheet(
  bitmap: ImageBitmap,
  spec: GridTemplateSpec,
  keys: string[],
  bg: RGB,
): Promise<Record<string, Blob>> {
  const cellW = Math.ceil(bitmap.width / spec.cols);
  const cellH = Math.ceil(bitmap.height / spec.rows);
  const probe = makeCanvas(cellW, cellH);
  const probeCtx = ctx2d(probe);

  const out: Record<string, Blob> = {};
  for (const key of keys) {
    const c = spec.cells[key];
    if (!c) continue;
    const cell = cellBox(bitmap, spec, c.col, c.row);
    const box = contentBox(probeCtx, bitmap, cell, bg) ?? cell;
    out[key] = await cropToBlob(bitmap, box);
  }
  return out;
}
