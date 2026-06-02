import { advanceAnimation } from './animation.ts';
import { applyPushCollision, detectHits } from './collision.ts';
import { recordInput } from './commands.ts';
import { applyHits } from './hitDef.ts';
import type { Character } from './schema.ts';
import { applyStateHeader, stepStateMachine } from './stateMachine.ts';
import { applyBinds, applyThrows, detectThrows } from './throw.ts';
import type { Inputs, Player, World } from './world.ts';
import { isDowned, KO_DELAY, STAGE_CEILING, STAGE_LEFT_X, STAGE_RIGHT_X } from './world.ts';

export function tick(world: World, characters: Record<string, Character>, inputs: Inputs): World {
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

    // OTG counter only persists while the player stays knocked down.
    const st = character.states[p.stateId];
    if (!st || !isDowned(st.type, st.moveType)) p.otgHits = 0;

    if (p.hitPause > 0) {
      p.hitPause--;
      continue;
    }

    // Players held in a throw are position-locked by applyBinds; they don't run
    // their own state machine or physics.
    if (p.bind !== null) {
      advanceAnimation(p, character);
      continue;
    }

    stepStateMachine(p, character, { world, inputs, playerIndex: i });
    applyPhysics(p, character);
    integratePosition(p);
    advanceAnimation(p, character);
  }

  // Advance existing throws (reposition / release) before resolving new grabs
  // and strikes. Grabs are checked before strikes so a throw beats a same-frame
  // attack; detectHits skips bound victims.
  applyBinds(world, characters);
  applyThrows(detectThrows(world), world, characters);

  const events = detectHits(world, characters);
  applyHits(events, world, characters);

  // Defeated fighters drop into their KO (lying) state. Velocity is kept so a
  // launched victim keeps falling — applyPhysics gives KO'd airborne players
  // gravity even though the lying state itself is grounded-physics.
  for (const p of world.players) {
    if (!p) continue;
    if (p.life <= 0 && p.stateId !== 'ko') {
      const ch = characters[p.characterId];
      if (ch && ch.states['ko']) {
        p.stateId = 'ko';
        p.stateTime = 0;
        p.activeHitDef = null;
        p.activeThrow = null;
        p.bind = null;
        applyStateHeader(p, ch, 'ko');
      }
    }
  }

  if (!world.matchOver && world.players.length >= 2) {
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
      // KO buffer: keep simulating for KO_DELAY ticks so the loser falls + lies
      // and the winner poses, THEN show the result.
      if (world.koCountdown <= 0) {
        world.koCountdown = KO_DELAY;
        const winner = alive === 1 ? world.players[lastAlive] : undefined;
        if (winner) {
          const wc = characters[winner.characterId];
          if (wc && wc.states['win']) {
            winner.stateId = 'win';
            winner.stateTime = 0;
            winner.ctrl = false;
            applyStateHeader(winner, wc, 'win');
          }
        }
      }
      world.koCountdown--;
      if (world.koCountdown <= 0) {
        world.matchOver = true;
        world.winner = alive === 1 ? lastAlive : null;
      }
    } else {
      // No KO — count the round clock down; decide by remaining life on time-up.
      world.roundTime--;
      if (world.roundTime <= 0) {
        world.roundTime = 0;
        world.matchOver = true;
        const p0 = world.players[0];
        const p1 = world.players[1];
        if (p0 && p1) {
          world.winner = p0.life > p1.life ? 0 : p1.life > p0.life ? 1 : null;
        }
      }
    }
  }

  applyPushCollision(world, characters);
  updateFacing(world);

  world.tick++;
  return world;
}

/**
 * Auto-turn each player to face its opponent. Only players in a free,
 * actionable state (`ctrl`) turn — attacking, airborne, and hitstun states
 * (all `ctrl: 0`) keep their facing, which is what lets an air crossup land
 * behind the opponent and resolve the turn on touchdown. Ties (`dx === 0`)
 * keep the current facing to avoid jitter when bodies overlap.
 */
function updateFacing(world: World): void {
  const a = world.players[0];
  const b = world.players[1];
  if (!a || !b) return;
  faceOpponent(a, b);
  faceOpponent(b, a);
}

function faceOpponent(p: Player, opp: Player): void {
  if (!p.ctrl) return;
  const dx = opp.pos.x - p.pos.x;
  if (dx > 0) p.facing = 1;
  else if (dx < 0) p.facing = -1;
}

function tickMatchOver(world: World, characters: Record<string, Character>, inputs: Inputs): World {
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
  if (p.pos.y > STAGE_CEILING) {
    p.pos.y = STAGE_CEILING;
    if (p.vel.y > 0) p.vel.y = 0; // bonk: gravity then pulls them back down
  }
}

function applyPhysics(p: Player, character: Character): void {
  const state = character.states[p.stateId];
  if (!state) return;
  // A defeated fighter still in the air falls under gravity (the lying KO state
  // is grounded-physics, which would otherwise freeze a launched victim aloft).
  if (p.life <= 0 && p.pos.y > 0) {
    p.vel.y -= character.data.gravity;
    return;
  }
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
