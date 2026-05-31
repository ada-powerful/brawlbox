import { describe, expect, test } from 'vitest';
import { gridLayout } from '../src/creator/image/pack.ts';

describe('gridLayout', () => {
  test('places frames left-to-right, top-to-bottom', () => {
    const l = gridLayout(['a', 'b', 'c', 'd'], 10, 20, 2);
    expect(l.cols).toBe(2);
    expect(l.rows).toBe(2);
    expect(l.width).toBe(20);
    expect(l.height).toBe(40);
    expect(l.frames).toEqual({
      a: { x: 0, y: 0, w: 10, h: 20 },
      b: { x: 10, y: 0, w: 10, h: 20 },
      c: { x: 0, y: 20, w: 10, h: 20 },
      d: { x: 10, y: 20, w: 10, h: 20 },
    });
  });

  test('partial last row still sizes the atlas correctly', () => {
    const l = gridLayout(['a', 'b', 'c'], 16, 16, 2);
    expect(l.rows).toBe(2);
    expect(l.height).toBe(32);
    expect(l.frames.c).toEqual({ x: 0, y: 16, w: 16, h: 16 });
  });

  test('defaults to a roughly-square grid', () => {
    expect(gridLayout(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 8, 8).cols).toBe(3);
  });

  test('single frame', () => {
    const l = gridLayout(['only'], 32, 48);
    expect(l).toMatchObject({ cols: 1, rows: 1, width: 32, height: 48 });
  });
});
