import { describe, expect, test } from 'vitest';
import { stepStateMachine } from '../src/engine/stateMachine.ts';
import { parseCharacter, type Character } from '../src/engine/schema.ts';
import { Btn, MAX_POWER, createWorld } from '../src/engine/world.ts';
import baseChar from '../characters/base/character.json' with { type: 'json' };

const base = parseCharacter(baseChar);

function step(
  player: ReturnType<typeof createWorld>['players'][number],
  c: Character,
  buttons: number,
) {
  const world = createWorld();
  stepStateMachine(player!, c, {
    world,
    inputs: { players: [{ buttons }, { buttons: 0 }] },
    playerIndex: 0,
  });
}

function makeCharacter(
  states: Character['states'],
  animations?: Character['animations'],
): Character {
  return {
    meta: { id: 't', name: 't', author: 't', version: '0.0.0' },
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
    states,
    animations,
  };
}

describe('stepStateMachine', () => {
  test('ChangeState fires on trigger and resets stateTime', () => {
    const c = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [
          {
            type: 'ChangeState',
            value: 'walk',
            trigger: { op: 'button', held: 'right' },
          },
        ],
      },
      walk: {
        type: 'S',
        moveType: 'I',
        physics: 'N',
        controllers: [],
      },
    });
    const world = createWorld();
    world.players[0]!.stateTime = 5;
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: Btn.Right }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.stateId).toBe('walk');
    expect(world.players[0]!.stateTime).toBe(0);
  });

  test('ChangeState applies new state header (velSet) inline', () => {
    const c = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [
          {
            type: 'ChangeState',
            value: 'jump',
            trigger: { op: 'button', held: 'up' },
          },
        ],
      },
      jump: {
        type: 'A',
        moveType: 'I',
        physics: 'A',
        velSet: { y: 9 },
        ctrl: 0,
        controllers: [],
      },
    });
    const world = createWorld();
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: Btn.Up }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.stateId).toBe('jump');
    expect(world.players[0]!.vel.y).toBe(9);
    expect(world.players[0]!.ctrl).toBe(false);
  });

  test('ChangeState applies new state animation', () => {
    const c = makeCharacter(
      {
        stand: {
          type: 'S',
          moveType: 'I',
          physics: 'S',
          anim: 'idle',
          controllers: [
            {
              type: 'ChangeState',
              value: 'walk',
              trigger: { op: 'button', held: 'right' },
            },
          ],
        },
        walk: {
          type: 'S',
          moveType: 'I',
          physics: 'N',
          anim: 'walking',
          controllers: [],
        },
      },
      {
        idle: {
          loop: false,
          frames: [
            { sprite: 's', duration: -1, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
          ],
        },
        walking: {
          loop: true,
          frames: [
            { sprite: 'a', duration: 8, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
          ],
        },
      },
    );
    const world = createWorld();
    world.players[0]!.animId = 'idle';
    world.players[0]!.animFrame = 4;
    world.players[0]!.animTime = 3;
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: Btn.Right }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.animId).toBe('walking');
    expect(world.players[0]!.animFrame).toBe(0);
    expect(world.players[0]!.animTime).toBe(0);
  });

  test('ChangeAnim controller swaps animation without state change', () => {
    const c = makeCharacter(
      {
        jump: {
          type: 'A',
          moveType: 'I',
          physics: 'A',
          anim: 'rise',
          controllers: [
            {
              type: 'ChangeAnim',
              value: 'fall',
              trigger: { op: 'lt', left: { ref: 'vel.y' }, right: { const: 0 } },
            },
          ],
        },
      },
      {
        rise: {
          loop: false,
          frames: [
            { sprite: 'r', duration: -1, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
          ],
        },
        fall: {
          loop: false,
          frames: [
            { sprite: 'f', duration: -1, offset: { x: 0, y: 0 }, hitboxes: [], hurtboxes: [] },
          ],
        },
      },
    );
    const world = createWorld();
    world.players[0]!.stateId = 'jump';
    world.players[0]!.animId = 'rise';
    world.players[0]!.vel.y = -2;
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.animId).toBe('fall');
    expect(world.players[0]!.stateId).toBe('jump');
  });

  test('VelSet controller modifies player vel', () => {
    const c = makeCharacter({
      walk: {
        type: 'S',
        moveType: 'I',
        physics: 'N',
        controllers: [
          {
            type: 'VelSet',
            x: 3,
            trigger: { op: 'button', held: 'right' },
          },
        ],
      },
    });
    const world = createWorld();
    world.players[0]!.stateId = 'walk';
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: Btn.Right }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.vel.x).toBe(3);
  });

  test('controller with false trigger does not fire', () => {
    const c = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [
          {
            type: 'VelSet',
            x: 99,
            trigger: { op: 'button', held: 'right' },
          },
        ],
      },
    });
    const world = createWorld();
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.vel.x).toBe(0);
  });

  test('multiple controllers — last matching VelSet wins', () => {
    const c = makeCharacter({
      walk: {
        type: 'S',
        moveType: 'I',
        physics: 'N',
        controllers: [
          { type: 'VelSet', x: 3, trigger: { op: 'button', held: 'right' } },
          { type: 'VelSet', x: -2, trigger: { op: 'button', held: 'left' } },
        ],
      },
    });
    const world = createWorld();
    world.players[0]!.stateId = 'walk';
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: Btn.Right | Btn.Left }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.vel.x).toBe(-2);
  });

  test('stateTime increments when no transition fires', () => {
    const c = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [],
      },
    });
    const world = createWorld();
    world.players[0]!.stateTime = 0;
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.stateTime).toBe(1);
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.stateTime).toBe(2);
  });

  test('VelSet xForward applies velocity in the facing direction', () => {
    const c = makeCharacter({
      go: {
        type: 'S',
        moveType: 'I',
        physics: 'N',
        controllers: [
          {
            type: 'VelSet',
            xForward: 8,
            trigger: { op: 'eq', left: { ref: 'time' }, right: { const: 0 } },
          },
        ],
      },
    });
    const world = createWorld();
    const p = world.players[0]!;
    p.stateId = 'go';
    p.facing = -1;
    stepStateMachine(p, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(p.vel.x).toBe(-8); // 8 * facing(-1)
  });

  test('VelAdd xForward adds velocity in the facing direction', () => {
    const c = makeCharacter({
      go: {
        type: 'S',
        moveType: 'I',
        physics: 'N',
        controllers: [
          {
            type: 'VelAdd',
            xForward: 5,
            trigger: { op: 'eq', left: { ref: 'time' }, right: { const: 0 } },
          },
        ],
      },
    });
    const world = createWorld();
    const p = world.players[0]!;
    p.stateId = 'go';
    p.facing = 1;
    p.vel.x = 2;
    stepStateMachine(p, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(p.vel.x).toBe(7); // 2 + 5 * facing(1)
  });

  test('PowerAdd accumulates and clamps at MAX_POWER', () => {
    const c = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [
          {
            type: 'PowerAdd',
            value: 500,
            trigger: { op: 'eq', left: { const: 1 }, right: { const: 1 } },
          },
        ],
      },
    });
    const world = createWorld();
    const p = world.players[0]!;
    expect(p.power).toBe(0);
    stepStateMachine(p, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(p.power).toBe(500);

    p.power = MAX_POWER - 100;
    stepStateMachine(p, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(p.power).toBe(MAX_POWER); // clamped, not 3400
  });

  test('PowerSet sets the value and PowerAdd floors at 0', () => {
    const setChar = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [
          {
            type: 'PowerSet',
            value: 1200,
            trigger: { op: 'eq', left: { const: 1 }, right: { const: 1 } },
          },
        ],
      },
    });
    const world = createWorld();
    const p = world.players[0]!;
    p.power = 50;
    stepStateMachine(p, setChar, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(p.power).toBe(1200);

    const drainChar = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [
          {
            type: 'PowerAdd',
            value: -5000,
            trigger: { op: 'eq', left: { const: 1 }, right: { const: 1 } },
          },
        ],
      },
    });
    stepStateMachine(p, drainChar, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(p.power).toBe(0); // floored
  });

  test('Power controllers do not change state', () => {
    const c = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [
          {
            type: 'PowerAdd',
            value: 100,
            trigger: { op: 'eq', left: { const: 1 }, right: { const: 1 } },
          },
        ],
      },
    });
    const world = createWorld();
    const p = world.players[0]!;
    p.stateTime = 4;
    stepStateMachine(p, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(p.stateId).toBe('stand');
    expect(p.stateTime).toBe(5); // incremented, no state change
  });

  test('unknown stateId falls back to stand', () => {
    const c = makeCharacter({
      stand: {
        type: 'S',
        moveType: 'I',
        physics: 'S',
        controllers: [],
      },
    });
    const world = createWorld();
    world.players[0]!.stateId = 'mystery';
    stepStateMachine(world.players[0]!, c, {
      world,
      inputs: { players: [{ buttons: 0 }, { buttons: 0 }] },
      playerIndex: 0,
    });
    expect(world.players[0]!.stateId).toBe('stand');
    expect(world.players[0]!.stateTime).toBe(0);
  });
});

describe('base character: dash + crouch', () => {
  test('double-tap forward (F, release, F) dashes from stand', () => {
    const world = createWorld();
    const p = world.players[0]!;
    p.facing = 1;
    p.inputBuffer = [Btn.Right, 0, Btn.Right]; // tap, release, tap
    step(p, base, Btn.Right);
    expect(p.stateId).toBe('dash');
  });

  test('HOLDING forward walks, does not dash (no release between taps)', () => {
    const world = createWorld();
    const p = world.players[0]!;
    p.facing = 1;
    p.inputBuffer = [Btn.Right, Btn.Right, Btn.Right]; // held, never released
    step(p, base, Btn.Right);
    expect(p.stateId).toBe('walk');
  });

  test('dash applies a forward burst that flips with facing', () => {
    const world = createWorld();
    const p = world.players[0]!;
    p.stateId = 'dash';
    p.stateTime = 0;
    p.facing = -1;
    step(p, base, 0);
    expect(p.vel.x).toBe(-8); // xForward 8 * facing(-1)
  });

  test('dash auto-recovers to stand after its duration', () => {
    const world = createWorld();
    const p = world.players[0]!;
    p.stateId = 'dash';
    p.stateTime = 12;
    step(p, base, 0);
    expect(p.stateId).toBe('stand');
    expect(p.ctrl).toBe(true);
  });

  test('holding down crouches; releasing down stands back up', () => {
    const world = createWorld();
    const p = world.players[0]!;
    step(p, base, Btn.Down);
    expect(p.stateId).toBe('crouch');

    p.stateTime = 1;
    step(p, base, 0); // no longer holding down
    expect(p.stateId).toBe('stand');
  });
});
