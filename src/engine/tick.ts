import { advanceAnimation } from './animation.ts';
import { applyPushCollision, detectHits } from './collision.ts';
import { recordInput } from './commands.ts';
import { applyHits } from './hitDef.ts';
import type { Character } from './schema.ts';
import { applyStateHeader, stepStateMachine } from './stateMachine.ts';
import type { Inputs, Player, World } from './world.ts';
import { STAGE_LEFT_X, STAGE_RIGHT_X } from './world.ts';

export function tick(
  world: World,
  characters: Record<string, Character>,
  inputs: Inputs,
): World {
  if (world.matchOver) {
    return tickMatchOver(world, characters, inputs);
  }

  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    if (!p) continue;
    const character = characters[p.characterId];
    if (!character) continue;

    const inp = inputs.players[i]?.buttons ?? 0;
    recordInput(p.inputBuffer, inp);

    if (p.hitPause > 0) {
      p.hitPause--;
      continue;
    }

    stepStateMachine(p, character, { world, inputs, playerIndex: i });
    applyPhysics(p, character);
    integratePosition(p);
    advanceAnimation(p, character);
  }

  const events = detectHits(world, characters);
  applyHits(events, world, characters);

  for (const p of world.players) {
    if (!p) continue;
    if (p.life <= 0 && p.stateId !== 'ko') {
      const ch = characters[p.characterId];
      if (ch && ch.states['ko']) {
        p.stateId = 'ko';
        p.stateTime = 0;
        p.activeHitDef = null;
        applyStateHeader(p, ch, 'ko');
      }
    }
  }

  if (world.players.length >= 2) {
    let alive = 0;
    let lastAlive = -1;
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i];
      if (p && p.stateId !== 'ko') {
        alive++;
        lastAlive = i;
      }
    }
    if (alive <= 1) {
      world.matchOver = true;
      world.winner = alive === 1 ? lastAlive : null;
    }
  }

  applyPushCollision(world, characters);

  world.tick++;
  return world;
}

function tickMatchOver(
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

    if (p.hitPause > 0) {
      p.hitPause--;
      continue;
    }

    applyPhysics(p, character);
    integratePosition(p);
    advanceAnimation(p, character);
  }
  world.tick++;
  return world;
}

function integratePosition(p: Player): void {
  p.pos.x += p.vel.x;
  p.pos.y += p.vel.y;
  if (p.pos.x < STAGE_LEFT_X) p.pos.x = STAGE_LEFT_X;
  if (p.pos.x > STAGE_RIGHT_X) p.pos.x = STAGE_RIGHT_X;
  if (p.pos.y < 0) {
    p.pos.y = 0;
    if (p.vel.y < 0) p.vel.y = 0;
  }
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
