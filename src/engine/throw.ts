import type { Character } from './schema.ts';
import { applyStateHeader } from './stateMachine.ts';
import type { BindState, Player, World } from './world.ts';
import { STAGE_LEFT_X, STAGE_RIGHT_X } from './world.ts';

// Intentional, documented design choices in this first-cut throw model:
//  - Grabs beat everything: a grounded, non-KO, un-bound victim is grabbable
//    even in hitstun or mid-attack. There is no throw-tech / break yet.
//  - The grab is armed for the whole duration its `activeThrow` is set (cleared
//    on connect, ChangeState, hit, or KO) — gate the active window with the
//    grab state's own recovery timing, not per-frame.
//  - Mutual same-frame grabs resolve in player-index order (the lower index
//    wins); this is deterministic but not a tech. Throw escapes are deferred.

export interface ThrowEvent {
  attackerIdx: number;
  victimIdx: number;
}

/** A player can be grabbed only when grounded, controllable-ish, and not already bound or KO'd. */
function isGrabbable(victim: Player): boolean {
  return victim.pos.y <= 0 && victim.bind === null && victim.stateId !== 'ko';
}

/**
 * Range-based grab detection. An attacker with an armed `activeThrow` grabs the
 * first grabbable opponent that is in front of it and within the def's range
 * (edge-to-edge body distance on x, absolute height delta on y).
 */
export function detectThrows(world: World): ThrowEvent[] {
  const events: ThrowEvent[] = [];
  for (let i = 0; i < world.players.length; i++) {
    const attacker = world.players[i];
    if (!attacker || !attacker.activeThrow) continue;
    if (attacker.hitPause > 0 || attacker.bind !== null) continue;
    if (attacker.pos.y > 0) continue;
    const def = attacker.activeThrow;

    for (let j = 0; j < world.players.length; j++) {
      if (i === j) continue;
      const victim = world.players[j];
      if (!victim || victim.hitPause > 0) continue;
      if (!isGrabbable(victim)) continue;

      // Must be in front of the attacker (forward = facing direction).
      const forward = (victim.pos.x - attacker.pos.x) * attacker.facing;
      if (forward < 0) continue;

      const bodyDist =
        Math.abs(victim.pos.x - attacker.pos.x) - attacker.halfWidth - victim.halfWidth;
      const heightDelta = Math.abs(victim.pos.y - attacker.pos.y);
      if (bodyDist <= def.range.x && heightDelta <= def.range.y) {
        events.push({ attackerIdx: i, victimIdx: j });
        break;
      }
    }
  }
  return events;
}

/** Resolve grabs: bind each victim to its attacker and send the attacker into its throw state. */
export function applyThrows(
  events: ThrowEvent[],
  world: World,
  characters: Record<string, Character>,
): void {
  for (const e of events) {
    const attacker = world.players[e.attackerIdx];
    const victim = world.players[e.victimIdx];
    if (!attacker || !victim || !attacker.activeThrow) continue;
    // Re-check grabbability in case an earlier event in this pass already bound the victim.
    if (victim.bind !== null) continue;
    const def = attacker.activeThrow;
    const aChar = characters[attacker.characterId];
    const vChar = characters[victim.characterId];
    if (!aChar || !vChar) continue;

    victim.life -= def.damage;
    if (victim.life < 0) victim.life = 0;

    const bind: BindState = {
      thrower: e.attackerIdx,
      time: def.bindTime,
      pos: { x: def.bindPos.x, y: def.bindPos.y },
      releaseVel: { x: def.throwVel.x, y: def.throwVel.y },
      releaseState: def.releaseState,
    };
    victim.bind = bind;
    victim.ctrl = false;
    victim.vel.x = 0;
    victim.vel.y = 0;
    victim.activeHitDef = null;
    victim.activeThrow = null;
    // Show a "held" pose if the victim defines one; otherwise a flinch.
    const heldState = vChar.states['thrown']
      ? 'thrown'
      : vChar.states['hit.stand']
        ? 'hit.stand'
        : null;
    if (heldState) {
      victim.stateId = heldState;
      victim.stateTime = 0;
      applyStateHeader(victim, vChar, heldState);
    }
    victim.ctrl = false;
    syncBindPos(victim, attacker, bind);

    attacker.stateId = def.attackerState;
    attacker.stateTime = 0;
    attacker.activeHitDef = null;
    attacker.activeThrow = null;
    applyStateHeader(attacker, aChar, def.attackerState);
  }
}

/**
 * Advance every active bind: hold the victim at the thrower's offset and count
 * down, releasing them with the toss velocity when the timer expires. Bound
 * victims do not run their own state machine (handled in tick.ts).
 */
export function applyBinds(world: World, characters: Record<string, Character>): void {
  for (const victim of world.players) {
    if (!victim || victim.bind === null) continue;
    const bind = victim.bind;
    const thrower = world.players[bind.thrower];

    // Thrower gone or KO'd mid-throw: release immediately, tossing in the
    // thrower's last facing (fall back to the victim's own facing if absent).
    if (!thrower || thrower.stateId === 'ko') {
      releaseVictim(victim, thrower ? thrower.facing : victim.facing, characters);
      continue;
    }

    bind.time--;
    // Release when the hold expires OR the thrower has regained control. The
    // latter bounds the hold to the thrower's throw animation, so a misauthored
    // short attackerState can't leave a recovered thrower dragging an
    // invulnerable victim around the stage.
    if (bind.time <= 0 || thrower.ctrl) {
      releaseVictim(victim, thrower.facing, characters);
    } else {
      syncBindPos(victim, thrower, bind);
    }
  }
}

function syncBindPos(victim: Player, thrower: Player, bind: BindState): void {
  victim.pos.x = thrower.pos.x + bind.pos.x * thrower.facing;
  victim.pos.y = bind.pos.y;
  if (victim.pos.x < STAGE_LEFT_X) victim.pos.x = STAGE_LEFT_X;
  if (victim.pos.x > STAGE_RIGHT_X) victim.pos.x = STAGE_RIGHT_X;
  // Face the thrower while held.
  victim.facing = thrower.facing === 1 ? -1 : 1;
}

function releaseVictim(
  victim: Player,
  throwerFacing: 1 | -1,
  characters: Record<string, Character>,
): void {
  const bind = victim.bind;
  if (!bind) return;
  victim.vel.x = bind.releaseVel.x * throwerFacing;
  victim.vel.y = bind.releaseVel.y;
  victim.bind = null;
  victim.ctrl = false;
  victim.activeHitDef = null;
  victim.activeThrow = null;

  const vChar = characters[victim.characterId];
  // Prefer the authored release state, then the universal air-hit reaction,
  // then a plain stand. If none exist, fail safe to an actionable victim rather
  // than soft-locking them in a (possibly controller-less) hold pose.
  const target = vChar
    ? vChar.states[bind.releaseState]
      ? bind.releaseState
      : vChar.states['hit.air']
        ? 'hit.air'
        : vChar.states['stand']
          ? 'stand'
          : null
    : null;
  if (target && vChar) {
    victim.stateId = target;
    victim.stateTime = 0;
    // Preserve the toss velocity: apply the state header (anim/ctrl) but
    // re-assert vel afterward in case the release state zeroes it.
    const vx = victim.vel.x;
    const vy = victim.vel.y;
    applyStateHeader(victim, vChar, target);
    victim.vel.x = vx;
    victim.vel.y = vy;
  } else {
    victim.ctrl = true;
  }
}
