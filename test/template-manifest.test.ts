import { describe, expect, test } from 'vitest';
import {
  groupIntoRows,
  inferSelector,
  selectFrameIndices,
  selectFrames,
  type FrameSelector,
} from '../src/creator/image/templateManifest.ts';
import type { PixelBox } from '../src/creator/image/alpha.ts';

/** Build a frame list of `rows` rows × `cols` cols, laid out top→bottom, left→right. */
function grid(rows: number, cols: number, cellW = 30, cellH = 30, gap = 10): PixelBox[] {
  const out: PixelBox[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: c * (cellW + gap), y: r * (cellH + gap), w: cellW, h: cellH });
    }
  }
  return out;
}

describe('groupIntoRows', () => {
  test('splits frames into rows by y position', () => {
    const frames = grid(3, 4);
    const rows = groupIntoRows(frames);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.length === 4)).toBe(true);
  });

  test('keeps each row ordered left-to-right', () => {
    const frames: PixelBox[] = [
      { x: 50, y: 0, w: 20, h: 20 },
      { x: 10, y: 2, w: 20, h: 20 },
      { x: 90, y: 1, w: 20, h: 20 },
    ];
    const [row] = groupIntoRows(frames);
    expect(row!.map((f) => f.x)).toEqual([10, 50, 90]);
  });
});

describe('selectFrameIndices', () => {
  const manifest: Record<string, FrameSelector> = {
    stand: { row: 0, frac: 0 },
    'walk-1': { row: 1, frac: 1 }, // last frame of row 1
    mid: { row: 2, frac: 0.5 }, // middle of row 2
  };

  test('maps (row, frac) to the correct flat index', () => {
    const frames = grid(3, 4); // indices 0-3 row0, 4-7 row1, 8-11 row2
    const got = selectFrameIndices(frames, ['stand', 'walk-1', 'mid'], manifest);
    expect(got.stand).toBe(0); // row0 first
    expect(got['walk-1']).toBe(7); // row1 last
    expect(got.mid).toBe(10); // row2, round(0.5*3)=2 -> index 8+2
  });

  test('falls back to the stand frame for unknown keys and missing rows', () => {
    const frames = grid(1, 3); // only one row exists
    const got = selectFrameIndices(frames, ['stand', 'walk-1', 'unknown'], manifest);
    expect(got.stand).toBe(0);
    expect(got['walk-1']).toBe(0); // row1 missing -> fallback to row0[0]
    expect(got.unknown).toBe(0); // no manifest entry -> fallback
  });

  test('selectFrames returns the boxes the indices point at', () => {
    const frames = grid(3, 4);
    const indices = selectFrameIndices(frames, ['stand', 'mid'], manifest);
    const boxes = selectFrames(frames, ['stand', 'mid'], manifest);
    expect(boxes.stand).toEqual(frames[indices.stand!]);
    expect(boxes.mid).toEqual(frames[indices.mid!]);
  });
});

describe('inferSelector (fuzzy fallback for unmapped keys)', () => {
  test('places invented attack keys on a real attack band, never idle', () => {
    // Kick (row 7) is the generic attack band; punch is row 6.
    expect(inferSelector('uppercut-startup')).toEqual({ row: 7, frac: 0 });
    expect(inferSelector('uppercut-active')).toEqual({ row: 7, frac: 0.5 });
    expect(inferSelector('uppercut-recovery')).toEqual({ row: 7, frac: 0.85 });
    expect(inferSelector('superpunch-active')).toEqual({ row: 6, frac: 0.5 });
    expect(inferSelector('spin-kick')).toEqual({ row: 7, frac: 0.5 });
    expect(inferSelector('guard-stand')).toEqual({ row: 5, frac: 0.5 });
  });

  test('returns undefined for keys it cannot place (caller falls back to stand)', () => {
    expect(inferSelector('whatever')).toBeUndefined();
    expect(inferSelector('prop-3')).toBeUndefined();
  });
});

describe('selectFrameIndices with the default manifest', () => {
  // row r, frac f -> flat index r*4 + round(f*(4-1))
  test('new vocabulary keys resolve to distinct bands', () => {
    const frames = grid(13, 4);
    const got = selectFrameIndices(frames, [
      'guard-stand',
      'dash-0',
      'kick-active',
      'punch-active',
      'hit-crouch',
      'getup',
    ]);
    expect(got['guard-stand']).toBe(5 * 4 + Math.round(0.25 * 3)); // row 5
    expect(got['dash-0']).toBe(4 * 4 + Math.round(0.4 * 3)); // row 4
    expect(got['kick-active']).toBe(7 * 4 + Math.round(0.1 * 3)); // row 7
    expect(got['punch-active']).toBe(6 * 4 + Math.round(0.2 * 3)); // row 6
    expect(got['hit-crouch']).toBe(9 * 4 + Math.round(0.889 * 3)); // row 9
    expect(got.getup).toBe(10 * 4 + 3); // row 10, frac 1.0
  });

  test('an invented attack key lands on an attack frame, not the idle pose', () => {
    const frames = grid(12, 4);
    const got = selectFrameIndices(frames, ['uppercut-active']);
    expect(got['uppercut-active']).toBe(7 * 4 + 2); // kick band
    expect(got['uppercut-active']).not.toBe(0); // NOT the stand fallback
  });
});
