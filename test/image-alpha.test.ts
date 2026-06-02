import { describe, expect, test } from 'vitest';
import {
  alphaBoundingBox,
  despillChroma,
  isGreenScreen,
  keyOutChroma,
  keyOutGreenScreen,
  pixelBoxToLocalAABB,
} from '../src/creator/image/alpha.ts';

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

describe('isGreenScreen', () => {
  // Real colours sampled from a generated sheet whose backdrop drifted olive.
  test('treats both clean chroma-green and olive/muddy spill as backdrop', () => {
    expect(isGreenScreen(14, 233, 14)).toBe(true); // clean chroma green
    expect(isGreenScreen(96, 168, 48)).toBe(true); // olive spill
    expect(isGreenScreen(96, 144, 48)).toBe(true); // darker olive spill
  });

  test('keeps character colours (skin, denim, white, dark outline)', () => {
    expect(isGreenScreen(210, 170, 130)).toBe(false); // skin
    expect(isGreenScreen(48, 96, 120)).toBe(false); // blue denim
    expect(isGreenScreen(240, 240, 240)).toBe(false); // white
    expect(isGreenScreen(24, 24, 24)).toBe(false); // dark outline (below floor)
  });
});

describe('keyOutGreenScreen', () => {
  test('clears green-dominant pixels and leaves the character opaque', () => {
    const data = new Uint8ClampedArray([
      96, 168, 48, 255, // olive backdrop
      210, 170, 130, 255, // skin
    ]);
    keyOutGreenScreen(data);
    expect(data[3]).toBe(0); // backdrop cut out
    expect(data[7]).toBe(255); // character kept
  });
});

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

describe('keyOutChroma', () => {
  const MAGENTA = { r: 255, g: 0, b: 255 };

  test('zeroes alpha on background pixels, keeps the subject', () => {
    // 2 px: one magenta bg (opaque), one brown character (opaque)
    const data = new Uint8ClampedArray([255, 0, 255, 255, 120, 80, 40, 255]);
    keyOutChroma(data, MAGENTA);
    expect(data[3]).toBe(0); // bg keyed out
    expect(data[7]).toBe(255); // character untouched
  });

  test('tolerance catches near-key anti-aliased pixels', () => {
    const data = new Uint8ClampedArray([245, 10, 245, 255]); // slightly off magenta
    keyOutChroma(data, MAGENTA, 60);
    expect(data[3]).toBe(0);
  });

  test('a color far from the key is preserved', () => {
    const data = new Uint8ClampedArray([0, 200, 0, 255]); // green
    keyOutChroma(data, MAGENTA, 120);
    expect(data[3]).toBe(255);
  });
});

describe('despillChroma', () => {
  const GREEN = { r: 0, g: 255, b: 0 };

  test('clamps a green-fringe pixel down to the brighter neighbor channel', () => {
    // White gi edge tinted green: g overshoots r,b → clamped to max(r,b).
    const data = new Uint8ClampedArray([200, 240, 210, 255]);
    despillChroma(data, GREEN);
    expect(data[1]).toBe(210); // g lowered to max(r=200, b=210)
    expect([data[0], data[2]]).toEqual([200, 210]); // r,b untouched
  });

  test('leaves a pixel whose green is already not dominant', () => {
    const data = new Uint8ClampedArray([200, 150, 180, 255]);
    despillChroma(data, GREEN);
    expect([...data]).toEqual([200, 150, 180, 255]);
  });

  test('skips fully transparent pixels', () => {
    const data = new Uint8ClampedArray([0, 255, 0, 0]);
    despillChroma(data, GREEN);
    expect(data[1]).toBe(255); // untouched — already keyed out
  });

  test('magenta key clamps BOTH high channels to the low one', () => {
    const MAGENTA = { r: 255, g: 0, b: 255 };
    // A pinkish edge tinted by a magenta grid: r,b overshoot g → both clamped to g.
    const data = new Uint8ClampedArray([230, 90, 240, 255]);
    despillChroma(data, MAGENTA);
    expect([data[0], data[1], data[2]]).toEqual([90, 90, 90]); // neutralized
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
