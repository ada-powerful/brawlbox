import { describe, expect, test } from 'vitest';
import { applyHit } from '../src/engine/hitDef.ts';
import { parseCharacter, type HitDef } from '../src/engine/schema.ts';
import { evalTrigger } from '../src/engine/triggers.ts';
import { stepStateMachine } from '../src/engine/stateMachine.ts';
import { Btn, createWorld } from '../src/engine/world.ts';
import baseChar from '../characters/base/character.json' with { type: 'json' };

const character = parseCharacter(baseChar);
const characters = { base: character };

function hitDef(over: Partial<HitDef> = {}): HitDef {
  return {
    attr: { state: 'S', class: 'NA' },
    damage: { hit: 50, guard: 5 },
    hitFlag: 'MAF',
    guardFlag: 'MA',
    pauseTime: { p1: 8, p2: 8 },
    groundHitTime: 12,
    groundVelocity: { x: 4, y: 0 },
    airVelocity: { x: 3, y: 4 },
    priority: 3,
    ...over,
  };
}

// Victim is players[1] at x=400, attacker players[0] at x=360, so "back" (away
// from the attacker) for the victim is Right.
function setup(victimState: string, heldButtons = 0) {
  const w = createWorld();
  const a = w.players[0]!;
  const v = w.players[1]!;
  a.pos.x = 360;
  v.pos.x = 400;
  v.stateId = victimState;
  if (heldButtons) v.inputBuffer.push(heldButtons);
  return { w, a, v };
}

describe('blocking', () => {
  test('holding back in a neutral state blocks: chip damage, guard state, no knockback', () => {
    const { a, v } = setup('stand', Btn.Right);
    applyHit(a, v, hitDef(), character);
    expect(v.stateId).toBe('guard.stand');
    expect(v.life).toBe(995); // 1000 - damage.guard (5), not 50
    expect(a.moveGuarded).toBe(true);
    expect(a.moveHit).toBe(false);
  });

  test('not holding back takes the full hit', () => {
    const { a, v } = setup('stand', 0);
    applyHit(a, v, hitDef(), character);
    expect(v.stateId).toBe('hit.stand');
    expect(v.life).toBe(950);
    expect(a.moveHit).toBe(true);
    expect(a.moveGuarded).toBe(false);
  });

  test('cannot block while attacking (moveType A)', () => {
    const { a, v } = setup('punch', Btn.Right); // holding back, but mid-attack
    applyHit(a, v, hitDef(), character);
    expect(v.stateId).toBe('hit.stand');
  });

  test('crouch-blocks a mid attack while holding down-back', () => {
    const { a, v } = setup('crouch', Btn.Right | Btn.Down);
    applyHit(a, v, hitDef(), character);
    expect(v.stateId).toBe('guard.crouch');
  });

  test('a high-only attack is NOT blocked while crouching (high/low mixup)', () => {
    const { a, v } = setup('crouch', Btn.Right | Btn.Down);
    applyHit(a, v, hitDef({ guardFlag: 'H' }), character);
    expect(v.stateId).toBe('hit.stand');
    expect(v.life).toBe(950);
  });

  test('a low-only attack is NOT blocked while standing', () => {
    const { a, v } = setup('stand', Btn.Right);
    applyHit(a, v, hitDef({ guardFlag: 'L' }), character);
    expect(v.stateId).toBe('hit.stand');
  });

  test('air-guards an air-guardable attack', () => {
    const { a, v } = setup('jump', Btn.Right);
    v.pos.y = 50;
    applyHit(a, v, hitDef(), character);
    expect(v.stateId).toBe('guard.air');
  });

  test('guard pushback uses guardVelocity and flips with attacker facing', () => {
    const a1 = setup('stand', Btn.Right);
    a1.a.facing = 1;
    applyHit(a1.a, a1.v, hitDef({ guardVelocity: { x: 3, y: 0 } }), character);
    expect(a1.v.vel.x).toBe(3);

    const a2 = setup('stand', Btn.Right);
    a2.a.facing = -1;
    applyHit(a2.a, a2.v, hitDef({ guardVelocity: { x: 3, y: 0 } }), character);
    expect(a2.v.vel.x).toBe(-3);
  });

  test('guard pushback defaults to a scaled groundVelocity when unspecified', () => {
    const { a, v } = setup('stand', Btn.Right);
    applyHit(a, v, hitDef({ groundVelocity: { x: 8, y: 0 } }), character);
    expect(v.vel.x).toBe(4); // max(2, 8 * 0.5)
  });
});

describe('move-contact flags', () => {
  test('moveHit / moveGuarded / moveContact read the player state', () => {
    const w = createWorld();
    const p = w.players[0]!;
    const c = {
      world: w,
      player: p,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
      character,
    };

    p.moveHit = true;
    expect(evalTrigger({ op: 'flag', name: 'moveHit' }, c)).toBe(true);
    expect(evalTrigger({ op: 'flag', name: 'moveContact' }, c)).toBe(true);
    expect(evalTrigger({ op: 'flag', name: 'moveGuarded' }, c)).toBe(false);

    p.moveHit = false;
    p.moveGuarded = true;
    expect(evalTrigger({ op: 'flag', name: 'moveGuarded' }, c)).toBe(true);
    expect(evalTrigger({ op: 'flag', name: 'moveContact' }, c)).toBe(true);
  });

  test('ChangeState resets the move-contact flags', () => {
    const w = createWorld();
    const p = w.players[0]!;
    p.stateId = 'stand';
    p.moveHit = true;
    p.moveGuarded = true;
    // 'down' is held → stand transitions to crouch, clearing the flags.
    stepStateMachine(p, character, {
      world: w,
      inputs: { players: [{ buttons: Btn.Down }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(p.stateId).toBe('crouch');
    expect(p.moveHit).toBe(false);
    expect(p.moveGuarded).toBe(false);
  });
});

describe('guard integration (full tick)', () => {
  test('a player holding away from an incoming attack blocks it', async () => {
    const { tick } = await import('../src/engine/tick.ts');
    const w = createWorld();
    const a = w.players[0]!;
    const v = w.players[1]!;
    a.pos.x = 360;
    v.pos.x = 420; // within punch reach after a small step
    // p1 attacks (x = light punch), p2 holds back (Left, since p2 faces left toward p1).
    const awayForV = v.pos.x >= a.pos.x ? Btn.Right : Btn.Left;
    let blocked = false;
    for (let i = 0; i < 30 && !blocked; i++) {
      tick(w, characters, { players: [{ buttons: Btn.X }, { buttons: awayForV }] });
      if (v.stateId.startsWith('guard')) blocked = true;
    }
    expect(blocked).toBe(true);
    expect(v.life).toBeGreaterThan(900); // only chip damage taken
  });
});
