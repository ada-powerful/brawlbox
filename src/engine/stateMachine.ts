import { setAnimation } from './animation.ts';
import type { Character } from './schema.ts';
import type { Inputs, Player, World } from './world.ts';
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
    };
    if (!evalTrigger(c.trigger, trigCtx)) continue;

    switch (c.type) {
      case 'ChangeState':
        player.stateId = c.value;
        player.stateTime = 0;
        applyStateHeader(player, character, c.value);
        if (c.ctrl !== undefined) player.ctrl = c.ctrl === 1;
        changed = true;
        break;
      case 'ChangeAnim':
        setAnimation(player, c.value);
        break;
      case 'VelSet':
        if (c.x !== undefined) player.vel.x = c.x;
        if (c.y !== undefined) player.vel.y = c.y;
        break;
      case 'VelAdd':
        if (c.x !== undefined) player.vel.x += c.x;
        if (c.y !== undefined) player.vel.y += c.y;
        break;
      case 'CtrlSet':
        player.ctrl = c.value === 1;
        break;
    }

    if (changed) break;
  }

  if (!changed) {
    player.stateTime++;
  }
}
