import { describe, expect, test } from 'vitest';
import type { Character } from '../src/engine/schema.ts';
import {
  animFrameAt,
  assertAtlasCoverage,
  collectReferencedSprites,
  findMissingSprites,
} from '../src/runtime/atlas.ts';

// Build a Character touching only the fields the atlas helpers read. No Pixi.
function makeCharacter(
  animations: Character['animations'],
  spriteAtlas?: Character['spriteAtlas'],
): Character {
  return {
    meta: { id: 'c', name: 'c', author: 'c', version: '0.0.0' },
    data: {
      life: 1000,
      attack: 100,
      defence: 100,
      walkFwd: 3,
      walkBack: -2.4,
      jumpVel: { x: 0, y: 9 },
      gravity: 0.5,
      groundFriction: 0.85,
    },
    size: { width: 60, height: 100, headY: 92 },
    states: { stand: { type: 'S', moveType: 'I', physics: 'S', controllers: [] } },
    animations,
    spriteAtlas,
  };
}

const f = (sprite: string) => ({
  sprite,
  duration: 4,
  offset: { x: 0, y: 0 },
  hitboxes: [],
  hurtboxes: [],
});

const anims: Character['animations'] = {
  walk: { loop: true, frames: [f('walk-0'), f('walk-1')] },
  stand: { loop: false, frames: [f('stand')] },
  punch: { loop: false, frames: [f('punch-a'), f('walk-0')] }, // walk-0 reused
};

const rect = { x: 0, y: 0, w: 10, h: 10 };

describe('collectReferencedSprites', () => {
  test('de-dupes and returns in stable (sorted-anim) order', () => {
    const c = makeCharacter(anims);
    // anim ids sorted: punch, stand, walk
    expect(collectReferencedSprites(c)).toEqual(['punch-a', 'walk-0', 'stand', 'walk-1']);
  });

  test('empty when no animations', () => {
    expect(collectReferencedSprites(makeCharacter(undefined))).toEqual([]);
  });
});

describe('findMissingSprites', () => {
  test('none when atlas covers every referenced sprite', () => {
    const atlas = {
      url: 'a.png',
      frames: { 'walk-0': rect, 'walk-1': rect, stand: rect, 'punch-a': rect },
    };
    expect(findMissingSprites(makeCharacter(anims, atlas))).toEqual([]);
  });

  test('lists the gaps when the atlas is incomplete', () => {
    const atlas = { url: 'a.png', frames: { 'walk-0': rect, stand: rect } };
    expect(findMissingSprites(makeCharacter(anims, atlas)).sort()).toEqual(['punch-a', 'walk-1']);
  });

  test('all referenced sprites missing when no atlas declared', () => {
    // No atlas => every reference is "missing", but assertAtlasCoverage tolerates it.
    expect(findMissingSprites(makeCharacter(anims)).sort()).toEqual([
      'punch-a',
      'stand',
      'walk-0',
      'walk-1',
    ]);
  });
});

describe('assertAtlasCoverage', () => {
  test('no-op when the character declares no atlas (procedural fallback)', () => {
    expect(() => assertAtlasCoverage(makeCharacter(anims))).not.toThrow();
  });

  test('passes when the atlas is complete', () => {
    const atlas = {
      url: 'a.png',
      frames: { 'walk-0': rect, 'walk-1': rect, stand: rect, 'punch-a': rect },
    };
    expect(() => assertAtlasCoverage(makeCharacter(anims, atlas))).not.toThrow();
  });

  test('throws at load time listing missing sprites', () => {
    const atlas = { url: 'a.png', frames: { stand: rect } };
    expect(() => assertAtlasCoverage(makeCharacter(anims, atlas))).toThrow(/punch-a|walk-/);
  });
});

describe('animFrameAt', () => {
  test('resolves the sprite key for an (animId, frame)', () => {
    const c = makeCharacter(anims);
    expect(animFrameAt(c, 'walk', 1)?.sprite).toBe('walk-1');
  });

  test('undefined for unknown anim or out-of-range frame', () => {
    const c = makeCharacter(anims);
    expect(animFrameAt(c, 'nope', 0)).toBeUndefined();
    expect(animFrameAt(c, 'walk', 9)).toBeUndefined();
  });
});
