// Browser-only: slice a retextured template sheet by DETECTING the poses from
// their green gaps, then mapping them to engine sprite keys by grid position
// (row top→bottom, column left→right). Unlike a fixed fractional grid, this does
// not assume NB2 preserved the template's size, aspect, or spacing — it finds the
// poses wherever they landed. It IS guided by the template's known structure
// (how many rows, how many poses per row), so detection jitter (touching poses,
// missing gaps) is reconciled by splitting/merging to the expected count.
import type { PixelBox, RGB } from './alpha.ts';
import type { GridTemplateSpec } from './sliceGrid.ts';

/** A pixel differs from the background (is part of a pose). */
function isContent(
  data: Uint8ClampedArray,
  idx: number,
  bg: RGB,
  diff: number,
): boolean {
  if ((data[idx + 3] ?? 0) <= 8) return false;
  const dr = Math.abs((data[idx] ?? 0) - bg.r);
  const dg = Math.abs((data[idx + 1] ?? 0) - bg.g);
  const db = Math.abs((data[idx + 2] ?? 0) - bg.b);
  return dr + dg + db > diff;
}

/**
 * Split a 1-D content profile into exactly `k` segments. Content runs are found
 * where the profile rises above a small floor; then we reconcile to `k`: too many
 * runs → merge the pairs with the smallest gap between them; too few (poses that
 * touch with no gap) → split the widest run at its deepest internal valley. Pure.
 */
export function segmentByGaps(profile: number[], k: number): Array<[number, number]> {
  const n = profile.length;
  if (k <= 1 || n === 0) return [[0, Math.max(0, n)]];

  let max = 0;
  for (const v of profile) if (v > max) max = v;
  const floor = Math.max(1, max * 0.05);

  let segs: Array<[number, number]> = [];
  let s = -1;
  for (let i = 0; i < n; i++) {
    const on = (profile[i] ?? 0) > floor;
    if (on && s < 0) s = i;
    else if (!on && s >= 0) {
      segs.push([s, i]);
      s = -1;
    }
  }
  if (s >= 0) segs.push([s, n]);

  if (segs.length === 0) {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < k; i++) out.push([Math.floor((i * n) / k), Math.floor(((i + 1) * n) / k)]);
    return out;
  }

  // Too many runs: merge across the narrowest gaps (touching/over-segmented).
  while (segs.length > k) {
    let bi = 0;
    let best = Infinity;
    for (let i = 0; i < segs.length - 1; i++) {
      const gap = segs[i + 1]![0] - segs[i]![1];
      if (gap < best) {
        best = gap;
        bi = i;
      }
    }
    segs[bi] = [segs[bi]![0], segs[bi + 1]![1]];
    segs.splice(bi + 1, 1);
  }

  // Too few runs: split the widest run at its deepest internal valley.
  while (segs.length < k) {
    let wi = 0;
    let wbest = -1;
    for (let i = 0; i < segs.length; i++) {
      const w = segs[i]![1] - segs[i]![0];
      if (w > wbest) {
        wbest = w;
        wi = i;
      }
    }
    const [a, b] = segs[wi]!;
    if (b - a < 2) break; // nothing left to split
    let m = a + 1;
    let mv = Infinity;
    for (let i = a + 1; i < b - 1; i++) {
      if ((profile[i] ?? 0) < mv) {
        mv = profile[i] ?? 0;
        m = i;
      }
    }
    segs.splice(wi, 1, [a, m], [m, b]);
  }

  return segs;
}

/**
 * Split a 1-D content profile into exactly `k` segments using the KNOWN count as
 * a strong prior: place `k` evenly-spaced boundaries across the content extent,
 * then snap each to the deepest nearby valley (the green gap between poses). More
 * robust than pure gap-finding when poses touch (no gap to find) or carry effects
 * (spurious gaps): the even prior prevents lumping two poses into one segment or
 * over-splitting one, while the snap keeps cuts on real gaps. Pure.
 */
export function segmentByExpected(profile: number[], k: number): Array<[number, number]> {
  const n = profile.length;
  if (k <= 1 || n === 0) return [[0, Math.max(0, n)]];

  let max = 0;
  for (const v of profile) if (v > max) max = v;
  const floor = Math.max(1, max * 0.05);

  let lo = 0;
  while (lo < n && (profile[lo] ?? 0) <= floor) lo++;
  let hi = n - 1;
  while (hi > lo && (profile[hi] ?? 0) <= floor) hi--;
  if (hi <= lo) {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < k; i++) out.push([Math.floor((i * n) / k), Math.floor(((i + 1) * n) / k)]);
    return out;
  }
  hi += 1; // make exclusive

  const slot = (hi - lo) / k;
  const bounds = [lo];
  for (let i = 1; i < k; i++) {
    const expected = lo + i * slot;
    const win = slot * 0.4;
    const start = Math.max(bounds[bounds.length - 1]! + 1, Math.floor(expected - win));
    const end = Math.min(hi - 1, Math.ceil(expected + win));
    // Default to the expected position and only move for a strictly-deeper
    // valley, so a gapless (solid) region still splits evenly instead of left.
    let best = Math.min(end, Math.max(start, Math.round(expected)));
    let bv = profile[best] ?? Infinity;
    for (let x = start; x <= end; x++) {
      const v = profile[x] ?? 0;
      if (v < bv) {
        bv = v;
        best = x;
      }
    }
    bounds.push(Math.max(bounds[bounds.length - 1]! + 1, best));
  }
  bounds.push(hi);

  const segs: Array<[number, number]> = [];
  for (let i = 0; i < k; i++) segs.push([bounds[i]!, bounds[i + 1]!]);
  return segs;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

function ctx2d(
  c: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = (c as OffscreenCanvas).getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

function canvasToBlob(c: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in c) return (c as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  return new Promise((res, rej) =>
    (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'),
  );
}

/** Tight content box of the pose inside `region`, in full-sheet pixel coords. */
function tightBox(
  data: Uint8ClampedArray,
  width: number,
  region: PixelBox,
  bg: RGB,
  diff: number,
): PixelBox | null {
  let minX = region.x + region.w;
  let minY = region.y + region.h;
  let maxX = region.x - 1;
  let maxY = region.y - 1;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (isContent(data, (y * width + x) * 4, bg, diff)) {
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
 * Detect each pose by its green gaps and crop it for its sprite key. Maps poses
 * to keys by the template's grid structure: detected rows (top→bottom) align to
 * the template's rows in order, and within each row detected poses (left→right)
 * align to that row's columns in order (columns are contiguous from 0). `bg` is
 * the known background color. Returns spriteKey → tight pose PNG Blob.
 */
export async function sliceSheetByDetection(
  bitmap: ImageBitmap,
  spec: GridTemplateSpec,
  keys: string[],
  bg: RGB,
  diff = 60,
): Promise<Record<string, Blob>> {
  // Template structure: rows top→bottom, each row's keys left→right by column.
  const byRow = new Map<number, Array<{ key: string; col: number }>>();
  for (const [key, cell] of Object.entries(spec.cells)) {
    if (!byRow.has(cell.row)) byRow.set(cell.row, []);
    byRow.get(cell.row)!.push({ key, col: cell.col });
  }
  const rowIdx = [...byRow.keys()].sort((a, b) => a - b);
  for (const r of rowIdx) byRow.get(r)!.sort((a, b) => a.col - b.col);

  const want = new Set(keys);
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = ctx2d(canvas);
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const W = bitmap.width;
  const H = bitmap.height;

  // Row profile → reconcile to the template's row count.
  const rowProfile = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++) {
    let count = 0;
    for (let x = 0; x < W; x++) if (isContent(data, (y * W + x) * 4, bg, diff)) count++;
    rowProfile[y] = count;
  }
  const bands = segmentByExpected(rowProfile, rowIdx.length);

  const out: Record<string, Blob> = {};
  for (let ri = 0; ri < rowIdx.length; ri++) {
    const band = bands[ri];
    const rowKeys = byRow.get(rowIdx[ri]!)!;
    if (!band) continue;
    const [y0, y1] = band;

    // Column profile within this band → reconcile to this row's pose count.
    const colProfile = new Array<number>(W).fill(0);
    for (let x = 0; x < W; x++) {
      let count = 0;
      for (let y = y0; y < y1; y++) if (isContent(data, (y * W + x) * 4, bg, diff)) count++;
      colProfile[x] = count;
    }
    const cols = segmentByExpected(colProfile, rowKeys.length);

    for (let ci = 0; ci < rowKeys.length; ci++) {
      const entry = rowKeys[ci]!;
      if (!want.has(entry.key)) continue;
      const seg = cols[ci];
      if (!seg) continue;
      const region: PixelBox = { x: seg[0], y: y0, w: seg[1] - seg[0], h: y1 - y0 };
      const box = tightBox(data, W, region, bg, diff) ?? region;
      const crop = makeCanvas(box.w, box.h);
      ctx2d(crop).drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      out[entry.key] = await canvasToBlob(crop);
    }
  }

  // Belt-and-suspenders: any key we somehow missed → leave it out; packing/
  // coverage upstream will surface it. (Shouldn't happen with reconciliation.)
  return out;
}
