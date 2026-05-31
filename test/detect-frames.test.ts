import { describe, expect, test } from 'vitest';
import { detectFrames } from '../src/creator/image/detectFrames.ts';

/** Build an RGBA sheet (opaque black bg) with white-filled content boxes. */
function sheet(w: number, h: number, boxes: { x: number; y: number; w: number; h: number }[]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255; // opaque black
  for (const b of boxes) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
      }
    }
  }
  return data;
}

describe('detectFrames', () => {
  test('two frames in one row, separated by a gap', () => {
    const boxes = [
      { x: 2, y: 2, w: 6, h: 8 },
      { x: 14, y: 2, w: 6, h: 8 },
    ];
    expect(detectFrames(sheet(24, 14, boxes), 24, 14)).toEqual(boxes);
  });

  test('frames across two row bands, ordered top-to-bottom then left-to-right', () => {
    const boxes = [
      { x: 2, y: 2, w: 5, h: 5 }, // row 1 left
      { x: 12, y: 2, w: 5, h: 5 }, // row 1 right
      { x: 4, y: 14, w: 6, h: 6 }, // row 2
    ];
    const got = detectFrames(sheet(24, 24, boxes), 24, 24);
    expect(got).toEqual(boxes);
  });

  test('tightens cells to content (ignores surrounding background)', () => {
    // content occupies a sub-region; detector should return the snug box.
    const got = detectFrames(sheet(20, 20, [{ x: 5, y: 6, w: 6, h: 5 }]), 20, 20);
    expect(got).toEqual([{ x: 5, y: 6, w: 6, h: 5 }]);
  });

  test('detects dark cells on a white page (spriters-resource layout)', () => {
    const w = 24;
    const h = 14;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255; // white page
      data[i * 4 + 3] = 255;
    }
    const cells = [
      { x: 2, y: 2, w: 6, h: 8 },
      { x: 14, y: 2, w: 6, h: 8 },
    ];
    for (const c of cells) {
      for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) {
          const i = (y * w + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0; // dark cell
        }
      }
    }
    expect(detectFrames(data, w, h)).toEqual(cells); // bg sampled from white corner
  });

  test('drops sub-min speckles', () => {
    const got = detectFrames(sheet(20, 20, [{ x: 1, y: 1, w: 1, h: 1 }]), 20, 20, {
      minFrameW: 4,
      minFrameH: 4,
    });
    expect(got).toEqual([]);
  });
});
