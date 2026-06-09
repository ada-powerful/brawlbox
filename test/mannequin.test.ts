import { describe, expect, test } from 'vitest';
import { tick } from '../src/engine/tick.ts';
import { Btn, createWorld, type World } from '../src/engine/world.ts';
import { MANNEQUIN_CHARACTER } from '../src/sandbox/mannequin.ts';

const characters = { mannequin: MANNEQUIN_CHARACTER };

function world(): World {
  return createWorld('mannequin', 'mannequin');
}

const rep = (b: number, n: number): number[] => Array.from({ length: n }, () => b);

/** Run P1 through a per-tick button script; return every stateId P1 visited. */
function driveP1(w: World, frames: number[]): Set<string> {
  const visited = new Set<string>();
  for (const b of frames) {
    tick(w, characters, { players: [{ buttons: b }, { buttons: 0 }] });
    const p1 = w.players[0];
    if (p1) visited.add(p1.stateId);
  }
  return visited;
}

describe('mannequin builds and validates', () => {
  test('parseCharacter accepted the reduced moveset', () => {
    expect(MANNEQUIN_CHARACTER.meta.id).toBe('mannequin');
    // Core kept states (incl. throw + the merged kicks).
    for (const s of ['stand', 'walk', 'crouch', 'jump', 'throw', 'hk', 'crouchhk', 'dashkick']) {
      expect(MANNEQUIN_CHARACTER.states[s]).toBeDefined();
    }
  });

  test('cut moves are gone (states + animations)', () => {
    for (const s of ['hook', 'uppercut', 'crouchhook', 'punch2h']) {
      expect(MANNEQUIN_CHARACTER.states[s]).toBeUndefined();
    }
    for (const a of [
      'hook',
      'uppercut',
      'crouchhook',
      'punch2h',
      'run',
      'spin',
      'jumplk',
      'hk',
      'crouchhk',
      'dashkick',
    ]) {
      expect(MANNEQUIN_CHARACTER.animations?.[a]).toBeUndefined();
    }
  });

  test('merged moves borrow another row’s animation', () => {
    const st = MANNEQUIN_CHARACTER.states;
    expect((st['hk'] as { anim: string }).anim).toBe('lk');
    expect((st['crouchhk'] as { anim: string }).anim).toBe('crouchlk');
    expect((st['dashkick'] as { anim: string }).anim).toBe('walkkick');
    expect((st['dashkickHeavy'] as { anim: string }).anim).toBe('walkkick');
    expect((st['jumplk'] as { anim: string }).anim).toBe('jumphk');
  });

  test('heavy kick (c) reaches the merged hk state and plays the lk art', () => {
    const w = world();
    const visited = driveP1(w, [...rep(Btn.C, 6), 0, 0]);
    expect(visited.has('hk')).toBe(true);
    // The borrowed 'lk' animation is what actually renders during hk.
    expect(w.players[0]!.animId).toBe('lk');
  });

  test('crouch heavy kick (down+c) reaches crouchhk and plays the crouchlk art', () => {
    const w = world();
    const visited = driveP1(w, [Btn.Down, Btn.Down, ...rep(Btn.Down | Btn.C, 6), Btn.Down]);
    expect(visited.has('crouchhk')).toBe(true);
    expect(w.players[0]!.animId).toBe('crouchlk');
  });
});
