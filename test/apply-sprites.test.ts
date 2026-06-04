import { describe, expect, test } from 'vitest';
import { applySpritesToCharacter } from '../src/creator/image/pack.ts';
import type { AABB, Character, FrameRect } from '../src/engine/schema.ts';

const f = (sprite: string, hurtboxes: AABB[] = []) => ({
  sprite,
  duration: 4,
  offset: { x: 0, y: 0 },
  hitboxes: [{ x: 1, y: 2, w: 3, h: 4 }],
  hurtboxes,
});

function character(): Character {
  return {
    meta: { id: 'g', name: 'G', author: 'a', version: '1' },
    data: {
      life: 1000,
      attack: 100,
      defence: 100,
      walkFwd: 3,
      walkBack: -2,
      jumpVel: { x: 0, y: 9 },
      gravity: 0.5,
      groundFriction: 0.85,
    },
    size: { width: 60, height: 100, headY: 92 },
    states: { stand: { type: 'S', moveType: 'I', physics: 'S', controllers: [] } },
    animations: {
      stand: { loop: false, frames: [f('stand', [{ x: -99, y: -99, w: 1, h: 1 }])] },
      punch: { loop: false, frames: [f('punch-active'), f('stand')] },
    },
  };
}

const frames: Record<string, FrameRect> = {
  stand: { x: 0, y: 0, w: 160, h: 160 },
  'punch-active': { x: 160, y: 0, w: 160, h: 160 },
};
const hurtboxes: Record<string, AABB> = {
  stand: { x: -30, y: 0, w: 60, h: 150 },
  'punch-active': { x: -20, y: 0, w: 90, h: 140 },
};

describe('applySpritesToCharacter', () => {
  test('overwrites hurtboxes with the alpha box scaled to world units', () => {
    const out = applySpritesToCharacter(character(), 'atlas.png', frames, hurtboxes);
    expect(out.spriteAtlas).toEqual({ url: 'atlas.png', frames });
    // cellH 160 → renderer scale: Y = 100/160 = 0.625, X = 60/(160·60/110) = 0.6875.
    // The raw cell-pixel boxes are scaled by those factors so collision matches
    // the rendered body instead of the (2× larger) packed cell.
    expect(out.animations!.stand!.frames[0]!.hurtboxes).toEqual([
      { x: -20.625, y: 0, w: 41.25, h: 93.75 },
    ]);
    expect(out.animations!.punch!.frames[0]!.hurtboxes).toEqual([
      { x: -13.75, y: 0, w: 61.875, h: 87.5 },
    ]);
    // reused sprite key gets the same scaled box
    expect(out.animations!.punch!.frames[1]!.hurtboxes).toEqual([
      { x: -20.625, y: 0, w: 41.25, h: 93.75 },
    ]);
  });

  test('caps attack hitbox reach at the silhouette, keeping its vertical zone', () => {
    const out = applySpritesToCharacter(character(), 'atlas.png', frames, hurtboxes);
    const ub = out.animations!.punch!.frames[0]!.hurtboxes[0]!; // world silhouette
    const hb = out.animations!.punch!.frames[0]!.hitboxes[0]!;
    expect(hb.x + hb.w).toBeCloseTo(ub.x + ub.w, 5); // reach == limb tip (silhouette fwd)
    expect(hb.y).toBe(2); // authored vertical zone (high/low) preserved
    expect(hb.h).toBe(4);
  });

  test('does not mutate the input character', () => {
    const c = character();
    applySpritesToCharacter(c, 'atlas.png', frames, hurtboxes);
    expect(c.spriteAtlas).toBeUndefined();
    expect(c.animations!.stand!.frames[0]!.hurtboxes).toEqual([{ x: -99, y: -99, w: 1, h: 1 }]);
  });
});
