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
  test('attaches the atlas and overwrites body hurtboxes from the derived boxes', () => {
    const out = applySpritesToCharacter(character(), 'atlas.png', frames, hurtboxes);
    expect(out.spriteAtlas).toEqual({ url: 'atlas.png', frames });
    expect(out.animations!.stand!.frames[0]!.hurtboxes).toEqual([hurtboxes.stand]);
    expect(out.animations!.punch!.frames[0]!.hurtboxes).toEqual([hurtboxes['punch-active']]);
    // reused sprite key gets its derived box too
    expect(out.animations!.punch!.frames[1]!.hurtboxes).toEqual([hurtboxes.stand]);
  });

  test('leaves attack hitboxes untouched', () => {
    const out = applySpritesToCharacter(character(), 'atlas.png', frames, hurtboxes);
    expect(out.animations!.punch!.frames[0]!.hitboxes).toEqual([{ x: 1, y: 2, w: 3, h: 4 }]);
  });

  test('does not mutate the input character', () => {
    const c = character();
    applySpritesToCharacter(c, 'atlas.png', frames, hurtboxes);
    expect(c.spriteAtlas).toBeUndefined();
    expect(c.animations!.stand!.frames[0]!.hurtboxes).toEqual([{ x: -99, y: -99, w: 1, h: 1 }]);
  });
});
