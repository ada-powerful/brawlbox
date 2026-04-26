import type { HitEvent } from './collision.ts';
import type { Character, HitDef } from './schema.ts';
import { applyStateHeader } from './stateMachine.ts';
import type { Player, World } from './world.ts';

export function applyHits(
  events: HitEvent[],
  world: World,
  characters: Record<string, Character>,
): void {
  for (const e of events) {
    const attacker = world.players[e.attackerIdx];
    const victim = world.players[e.victimIdx];
    if (!attacker || !victim || !attacker.activeHitDef) continue;
    const vc = characters[victim.characterId];
    if (!vc) continue;
    applyHit(attacker, victim, attacker.activeHitDef, vc);
  }
}

export function applyHit(
  attacker: Player,
  victim: Player,
  hitDef: HitDef,
  victimCharacter: Character,
): void {
  victim.life -= hitDef.damage.hit;
  if (victim.life < 0) victim.life = 0;

  const isAir = victim.pos.y > 0;
  const targetState = isAir ? 'hit.air' : 'hit.stand';
  victim.stateId = targetState;
  victim.stateTime = 0;
  applyStateHeader(victim, victimCharacter, targetState);

  const v = isAir ? hitDef.airVelocity : hitDef.groundVelocity;
  victim.vel.x = v.x * attacker.facing;
  victim.vel.y = v.y;

  attacker.hitPause = hitDef.pauseTime.p1;
  victim.hitPause = hitDef.pauseTime.p2;

  attacker.activeHitDef = null;
}
