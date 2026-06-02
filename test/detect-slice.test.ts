import { describe, expect, test } from 'vitest';
import { dominantBox, segmentByExpected, segmentByGaps } from '../src/creator/image/detectSlice.ts';

// Build a row-major content mask from an ASCII grid ('#' = pose pixel).
function mask(rows: string[]): { mask: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0]!.length;
  const m = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) if (row[x] === '#') m[y * w + x] = 1;
  });
  return { mask: m, w, h };
}

// A 1-D content profile: high inside poses, ~0 in the green gaps between them.
describe('segmentByGaps', () => {
  test('returns the runs as-is when their count already matches k', () => {
    // two poses with a gap: [2..5) and [8..11)
    const p = [0, 0, 9, 9, 9, 0, 0, 0, 9, 9, 9, 0];
    expect(segmentByGaps(p, 2)).toEqual([
      [2, 5],
      [8, 11],
    ]);
  });

  test('merges across the narrowest gap when there are too many runs', () => {
    // three runs, but we want 2 — the tiny gap [5..6) merges its neighbors.
    const p = [9, 9, 9, 9, 9, 0, 9, 9, 9, 0, 0, 0, 0, 9, 9];
    const segs = segmentByGaps(p, 2);
    expect(segs.length).toBe(2);
    expect(segs[0]).toEqual([0, 9]); // first two runs merged across the 1-wide gap
    expect(segs[1]).toEqual([13, 15]);
  });

  test('splits the widest run at its valley when there are too few', () => {
    // one wide run with a dip in the middle → split into 2 at the minimum.
    const p = [9, 9, 8, 5, 2, 5, 8, 9, 9];
    const segs = segmentByGaps(p, 2);
    expect(segs.length).toBe(2);
    expect(segs[0]![0]).toBe(0);
    expect(segs[1]![1]).toBe(9);
    expect(segs[0]![1]).toBe(4); // split at the index of the deepest valley
  });

  test('falls back to equal slices when the profile is empty', () => {
    expect(segmentByGaps([0, 0, 0, 0], 2)).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
});

describe('segmentByExpected', () => {
  test('places k boundaries across the content, snapping to the gap', () => {
    // two poses [2..5) and [7..10) with a green gap at 5,6
    const p = [0, 0, 9, 9, 9, 0, 0, 9, 9, 9, 0, 0];
    const segs = segmentByExpected(p, 2);
    expect(segs.length).toBe(2);
    expect(segs[0]![0]).toBe(2);
    expect(segs[1]![1]).toBe(10);
    expect(segs[0]![1]).toBeGreaterThanOrEqual(5); // boundary lands in the gap
    expect(segs[0]![1]).toBeLessThanOrEqual(7);
  });

  test('splits touching poses with no gap evenly at the expected position', () => {
    const p = [9, 9, 9, 9, 9, 9, 9, 9]; // solid run, k=2 → even split
    const segs = segmentByExpected(p, 2);
    expect(segs.length).toBe(2);
    expect(segs[0]![1]).toBe(segs[1]![0]); // contiguous
    expect(segs[0]![1]).toBe(4); // middle, not skewed to an edge
  });

  test('never lumps two poses into one segment (count is exact)', () => {
    const p = [0, 9, 9, 0, 9, 9, 0, 9, 9, 0];
    expect(segmentByExpected(p, 3).length).toBe(3);
  });
});

describe('dominantBox', () => {
  test('returns the tight box of a single blob', () => {
    const { mask: m, w, h } = mask([
      '......',
      '.##...',
      '.##...',
      '......',
    ]);
    expect(dominantBox(m, w, h, 2)).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });

  test('drops a neighbouring pose that bled into the segment (the KO/faint bug)', () => {
    // A wide lying figure on the left, plus a sliver of the next pose that bled
    // in past a real gap on the right. A plain AABB would span both (w=11);
    // dominantBox keeps only the dominant figure.
    const { mask: m, w, h } = mask([
      '...........',
      '#####....#.',
      '#####....#.',
      '#####......',
      '...........',
    ]);
    const box = dominantBox(m, w, h, 2);
    expect(box).toEqual({ x: 0, y: 1, w: 5, h: 3 });
  });

  test('merges a figure split into nearby components (a limb a few px away)', () => {
    // Body + a detached limb one column away (gap of 1) → one figure.
    const { mask: m, w, h } = mask([
      '........',
      '.###.#..',
      '.###.#..',
      '........',
    ]);
    const box = dominantBox(m, w, h, 2);
    expect(box).toEqual({ x: 1, y: 1, w: 5, h: 2 });
  });

  test('returns null for an empty mask', () => {
    const { mask: m, w, h } = mask(['...', '...']);
    expect(dominantBox(m, w, h, 2)).toBeNull();
  });
});
