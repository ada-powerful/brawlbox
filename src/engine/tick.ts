import { advanceAnimation } from './animation.ts';
import { recordInput } from './commands.ts';
import type { Character } from './schema.ts';
import type { Inputs, Player, World } from './world.ts';
import { STAGE_LEFT_X, STAGE_RIGHT_X } from './world.ts';
import { stepStateMachine } from './stateMachine.ts';

export function tick(
  world: World,
  characters: Record<string, Character>,
  inputs: Inputs,
): World {
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    if (!p) continue;
    const character = characters[p.characterId];
    if (!character) continue;

    const inp = inputs.players[i]?.buttons ?? 0;
    recordInput(p.inputBuffer, inp);

    stepStateMachine(p, character, { world, inputs, playerIndex: i });
    applyPhysics(p, character);

    p.pos.x += p.vel.x;
    p.pos.y += p.vel.y;

    if (p.pos.x < STAGE_LEFT_X) p.pos.x = STAGE_LEFT_X;
    if (p.pos.x > STAGE_RIGHT_X) p.pos.x = STAGE_RIGHT_X;
    if (p.pos.y < 0) {
      p.pos.y = 0;
      if (p.vel.y < 0) p.vel.y = 0;
    }

    advanceAnimation(p, character);
  }

  world.tick++;
  return world;
}

function applyPhysics(p: Player, character: Character): void {
  const state = character.states[p.stateId];
  if (!state) return;
  switch (state.physics) {
    case 'A':
      p.vel.y -= character.data.gravity;
      break;
    case 'S':
    case 'C':
      p.vel.x *= character.data.groundFriction;
      break;
    case 'N':
      break;
  }
}
