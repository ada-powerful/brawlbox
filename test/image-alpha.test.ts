import { describe, expect, test } from 'vitest';
import { alphaBoundingBox, pixelBoxToLocalAABB } from '../src/creator/image/alpha.ts';

/** Build an RGBA buffer of `w`x`h`, opaque white inside `box`, transparent elsewhere. */
function buffer(w: number, h: number, box: { x: number; y: number; w: number; h: number }) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('alphaBoundingBox', () => {
  test('finds the tight box of opaque pixels', () => {
    const box = { x: 2, y: 3, w: 4, h: 5 };
    expect(alphaBoundingBox(buffer(16, 16, box), 16, 16)).toEqual(box);
  });

  test('single opaque pixel', () => {
    expect(alphaBoundingBox(buffer(8, 8, { x: 5, y: 6, w: 1, h: 1 }), 8, 8)).toEqual({
      x: 5,
      y: 6,
      w: 1,
      h: 1,
    });
  });

  test('null when fully transparent', () => {
    expect(alphaBoundingBox(new Uint8ClampedArray(8 * 8 * 4), 8, 8)).toBeNull();
  });

  test('respects the alpha threshold (faint pixels ignored)', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    // one faint pixel (alpha 10) and one solid (alpha 200)
    data[(0 * 4 + 0) * 4 + 3] = 10;
    const solid = (2 * 4 + 3) * 4;
    data[solid + 3] = 200;
    expect(alphaBoundingBox(data, 4, 4, 16)).toEqual({ x: 3, y: 2, w: 1, h: 1 });
  });
});

describe('pixelBoxToLocalAABB', () => {
  test('feet at cell bottom-center map to engine origin', () => {
    // A box spanning the full 100x120 cell -> x centered, y from 0 up.
    expect(pixelBoxToLocalAABB({ x: 0, y: 0, w: 100, h: 120 }, 100, 120)).toEqual({
      x: -50,
      y: 0,
      w: 100,
      h: 120,
    });
  });

  test('a torso box above the feet maps with correct y-flip', () => {
    // cell 80x160; box near the top (y 10..70) and horizontally centered (x 20..60)
    expect(pixelBoxToLocalAABB({ x: 20, y: 10, w: 40, h: 60 }, 80, 160)).toEqual({
      x: -20, // 20 - 40
      y: 90, // 160 - (10 + 60)
      w: 40,
      h: 60,
    });
  });
});
