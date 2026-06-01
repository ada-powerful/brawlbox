import { setAnimation } from './animation.ts';
import type { Character } from './schema.ts';
import type { Inputs, Player, World } from './world.ts';
import { MAX_POWER } from './world.ts';
import { evalTrigger } from './triggers.ts';

export function applyStateHeader(p: Player, character: Character, stateId: string): void {
  const state = character.states[stateId];
  if (!state) return;
  if (state.velSet) {
    if (state.velSet.x !== undefined) p.vel.x = state.velSet.x;
    if (state.velSet.y !== undefined) p.vel.y = state.velSet.y;
  }
  if (state.ctrl !== undefined) {
    p.ctrl = state.ctrl === 1;
  }
  if (state.anim !== undefined) {
    setAnimation(p, state.anim);
  }
}

export function stepStateMachine(
  player: Player,
  character: Character,
  ctx: { world: World; inputs: Inputs; playerIndex: number },
): void {
  const state = character.states[player.stateId];
  if (!state) {
    player.stateId = 'stand';
    player.stateTime = 0;
    player.activeHitDef = null;
    applyStateHeader(player, character, 'stand');
    return;
  }

  let changed = false;
  for (const c of state.controllers) {
    const trigCtx = {
      world: ctx.world,
      player,
      inputs: ctx.inputs,
      playerIndex: ctx.playerIndex,
      character,
    };
    if (!evalTrigger(c.trigger, trigCtx)) continue;

    switch (c.type) {
      case 'ChangeState':
        player.stateId = c.value;
        player.stateTime = 0;
        player.activeHitDef = null;
        player.activeThrow = null;
        // A new state begins a new move: clear last move's contact result so
        // moveHit/moveGuarded/moveContact triggers reflect the current move.
        player.moveHit = false;
        player.moveGuarded = false;
        applyStateHeader(player, character, c.value);
        if (c.ctrl !== undefined) player.ctrl = c.ctrl === 1;
        changed = true;
        break;
      case 'ChangeAnim':
        setAnimation(player, c.value);
        break;
      case 'VelSet':
        if (c.x !== undefined) player.vel.x = c.x;
        if (c.xForward !== undefined) player.vel.x = c.xForward * player.facing;
        if (c.y !== undefined) player.vel.y = c.y;
        break;
      case 'VelAdd':
        if (c.x !== undefined) player.vel.x += c.x;
        if (c.xForward !== undefined) player.vel.x += c.xForward * player.facing;
        if (c.y !== undefined) player.vel.y += c.y;
        break;
      case 'CtrlSet':
        player.ctrl = c.value === 1;
        break;
      case 'HitDef':
        player.activeHitDef = c.def;
        break;
      case 'PowerAdd':
        player.power = clampPower(player.power + c.value);
        break;
      case 'PowerSet':
        player.power = clampPower(c.value);
        break;
      case 'Throw':
        player.activeThrow = c.def;
        break;
    }

    if (changed) break;
  }

  if (!changed) {
    player.stateTime++;
  }
}

function clampPower(value: number): number {
  if (value < 0) return 0;
  if (value > MAX_POWER) return MAX_POWER;
  return value;
}
