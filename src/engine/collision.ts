import { getActiveFrame } from './animation.ts';
import type { AABB, Character } from './schema.ts';
import type { Player, World } from './world.ts';
import { isDowned, MAX_OTG, STAGE_LEFT_X, STAGE_RIGHT_X } from './world.ts';

export interface BoxRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface HitEvent {
  attackerIdx: number;
  victimIdx: number;
}

export function translateBox(box: AABB, player: Player): BoxRect {
  if (player.facing === 1) {
    return {
      minX: player.pos.x + box.x,
      maxX: player.pos.x + box.x + box.w,
      minY: player.pos.y + box.y,
      maxY: player.pos.y + box.y + box.h,
    };
  }
  return {
    minX: player.pos.x - box.x - box.w,
    maxX: player.pos.x - box.x,
    minY: player.pos.y + box.y,
    maxY: player.pos.y + box.y + box.h,
  };
}

export function overlap(a: BoxRect, b: BoxRect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function detectHits(world: World, characters: Record<string, Character>): HitEvent[] {
  const events: HitEvent[] = [];
  for (let i = 0; i < world.players.length; i++) {
    const attacker = world.players[i];
    if (!attacker || !attacker.activeHitDef) continue;
    if (attacker.hitPause > 0 || attacker.bind !== null) continue;
    const aChar = characters[attacker.characterId];
    if (!aChar) continue;
    const aFrame = getActiveFrame(attacker, aChar);
    if (!aFrame || aFrame.hitboxes.length === 0) continue;

    for (let j = 0; j < world.players.length; j++) {
      if (i === j) continue;
      const victim = world.players[j];
      if (!victim || victim.hitPause > 0 || victim.bind !== null) continue;
      if (victim.life <= 0) continue; // already defeated — no comboing the corpse
      const vChar = characters[victim.characterId];
      if (!vChar) continue;
      // Downed (knocked-down, still alive): only OTG-capable attacks connect, and
      // only up to MAX_OTG times — otherwise a downed victim is invulnerable.
      const vState = vChar.states[victim.stateId];
      if (vState && isDowned(vState.type, vState.moveType)) {
        if (!attacker.activeHitDef.canHitDown || victim.otgHits >= MAX_OTG) continue;
      }
      const vFrame = getActiveFrame(victim, vChar);
      if (!vFrame || vFrame.hurtboxes.length === 0) continue;

      let hit = false;
      for (const hb of aFrame.hitboxes) {
        const hbWorld = translateBox(hb, attacker);
        for (const ub of vFrame.hurtboxes) {
          const ubWorld = translateBox(ub, victim);
          if (overlap(hbWorld, ubWorld)) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }

      if (hit) {
        events.push({ attackerIdx: i, victimIdx: j });
      }
    }
  }
  return events;
}

export function applyPushCollision(world: World, characters: Record<string, Character>): void {
  for (let i = 0; i < world.players.length; i++) {
    for (let j = i + 1; j < world.players.length; j++) {
      const a = world.players[i];
      const b = world.players[j];
      if (!a || !b) continue;
      if (a.hitPause > 0 || b.hitPause > 0) continue;
      // Bound players are position-locked to their thrower; don't push them.
      if (a.bind !== null || b.bind !== null) continue;
      pushPair(a, b, characters);
    }
  }
}

function pushPair(a: Player, b: Player, characters: Record<string, Character>): void {
  const ca = characters[a.characterId];
  const cb = characters[b.characterId];
  if (!ca || !cb) return;

  // Push uses the body silhouette half-width (p.halfWidth, kept in sync by tick)
  // so fighters close to body contact — matching throw range and p2BodyDist,
  // which already use halfWidth — instead of the wider padded sprite cell.
  const aMinX = a.pos.x - a.halfWidth;
  const aMaxX = a.pos.x + a.halfWidth;
  const aMinY = a.pos.y;
  const aMaxY = a.pos.y + ca.size.height;

  const bMinX = b.pos.x - b.halfWidth;
  const bMaxX = b.pos.x + b.halfWidth;
  const bMinY = b.pos.y;
  const bMaxY = b.pos.y + cb.size.height;

  const overlapX = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX);
  const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);
  if (overlapX <= 0 || overlapY <= 0) return;

  const aGround = a.pos.y <= 0;
  const bGround = b.pos.y <= 0;
  if (!aGround && !bGround) return;

  const sign = a.pos.x < b.pos.x ? 1 : -1;

  if (aGround && bGround) {
    a.pos.x -= overlapX * 0.5 * sign;
    b.pos.x += overlapX * 0.5 * sign;
  } else if (aGround) {
    a.pos.x -= overlapX * sign;
  } else {
    b.pos.x += overlapX * sign;
  }

  const aReb = clampPlayerX(a);
  const bReb = clampPlayerX(b);

  if (aReb !== 0 && bGround) {
    b.pos.x += aReb;
    clampPlayerX(b);
  }
  if (bReb !== 0 && aGround) {
    a.pos.x += bReb;
    clampPlayerX(a);
  }
}

function clampPlayerX(p: Player): number {
  if (p.pos.x < STAGE_LEFT_X) {
    const reb = STAGE_LEFT_X - p.pos.x;
    p.pos.x = STAGE_LEFT_X;
    return reb;
  }
  if (p.pos.x > STAGE_RIGHT_X) {
    const reb = STAGE_RIGHT_X - p.pos.x;
    p.pos.x = STAGE_RIGHT_X;
    return reb;
  }
  return 0;
}
