import { describe, expect, test } from 'vitest';
import { segmentByExpected, segmentByGaps } from '../src/creator/image/detectSlice.ts';

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
