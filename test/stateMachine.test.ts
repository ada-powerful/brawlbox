import { describe, expect, test } from 'vitest';
import { stepStateMachine } from '../src/engine/stateMachine.ts';
import type { Character } from '../src/engine/schema.ts';
import { Btn, createWorld } from '../src/engine/world.ts';

function makeCharacter(states: Character['states']): Character {
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
