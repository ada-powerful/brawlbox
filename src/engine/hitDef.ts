import type { HitEvent } from './collision.ts';
import type { Character, HitDef } from './schema.ts';
import { applyStateHeader } from './stateMachine.ts';
import type { Player, World } from './world.ts';
import { Btn, isDowned, MAX_OTG, STUN_MAX } from './world.ts';

export function applyHits(
  events: HitEvent[],
  world: World,
  characters: Record<string, Character>,
): void {
  for (const e of events) {
    const attacker = world.players[e.attackerIdx];
    const victim = world.players[e.victimIdx];
    if (!attacker || !victim || !attacker.activeHitDef) continue;
    if (victim.bind !== null) continue;
    const vc = characters[victim.characterId];
    if (!vc) continue;
    applyHit(attacker, victim, attacker.activeHitDef, vc);
  }
}

type Defense = 'hit' | 'guard.stand' | 'guard.crouch' | 'guard.air';

/**
 * Decide whether the victim blocks the incoming hit. Blocking requires:
 *  - the victim is in a neutral (moveType 'I') state (not attacking / in hitstun),
 *  - holding away from the attacker (back),
 *  - the guard position the HitDef's guardFlag permits (H high, L low, M mid, A air),
 *  - and the corresponding guard state is authored on the victim.
 * Blocking in the wrong position (e.g. crouch-guarding a high attack) lands as a hit.
 */
function resolveDefense(
  attacker: Player,
  victim: Player,
  hitDef: HitDef,
  victimCharacter: Character,
): Defense {
  const vState = victimCharacter.states[victim.stateId];
  if (!vState || vState.moveType !== 'I') return 'hit';

  const input = victim.inputBuffer[victim.inputBuffer.length - 1] ?? 0;
  const awayBit = victim.pos.x >= attacker.pos.x ? Btn.Right : Btn.Left;
  if ((input & awayBit) === 0) return 'hit'; // not holding back

  const gf = hitDef.guardFlag.toUpperCase();
  const high = gf.includes('H') || gf.includes('M');
  const low = gf.includes('L') || gf.includes('M');
  const air = gf.includes('A');

  if (victim.pos.y > 0) {
    return air && victimCharacter.states['guard.air'] ? 'guard.air' : 'hit';
  }
  if ((input & Btn.Down) !== 0) {
    return low && victimCharacter.states['guard.crouch'] ? 'guard.crouch' : 'hit';
  }
  return high && victimCharacter.states['guard.stand'] ? 'guard.stand' : 'hit';
}

export function applyHit(
  attacker: Player,
  victim: Player,
  hitDef: HitDef,
  victimCharacter: Character,
): void {
  // OTG follow-up: the victim is already knocked down (detectHits has confirmed
  // the attack is OTG-capable and the limit isn't reached). Re-down them, or on
  // the limit hit force a wake-up. A downed victim can't block, so skip guard.
  const vState = victimCharacter.states[victim.stateId];
  if (vState && isDowned(vState.type, vState.moveType)) {
    victim.life -= hitDef.damage.hit;
    if (victim.life < 0) victim.life = 0;
    victim.otgHits++;
    if (victim.otgHits >= MAX_OTG && victimCharacter.states['getup']) {
      victim.stateId = 'getup';
      applyStateHeader(victim, victimCharacter, 'getup');
    }
    victim.stateTime = 0; // restart the knockdown (or getup) timer
    victim.hitPause = hitDef.pauseTime.p2;
    attacker.hitPause = hitDef.pauseTime.p1;
    attacker.moveHit = true;
    attacker.activeHitDef = null;
    return;
  }

  const defense = resolveDefense(attacker, victim, hitDef, victimCharacter);

  if (defense === 'hit') {
    victim.life -= hitDef.damage.hit;
    if (victim.life < 0) victim.life = 0;

    const isAir = victim.pos.y > 0;
    const v = isAir ? hitDef.airVelocity : hitDef.groundVelocity;
    // An upward knockback launches the victim: route to the AIRBORNE hit state
    // (physics 'A', gravity) so they arc up and fall back down. Otherwise a
    // grounded victim in the gravity-less standing-hit state floats away forever.
    const launched = v.y > 0;
    let targetState = isAir || launched ? 'hit.air' : 'hit.stand';

    // Dizzy: grounded, non-launching hits build the stun meter. When it tops out
    // the victim is stunned — routed to a 'dizzy' state (if the character has one)
    // and the meter resets. Launches/air hits don't stun (they have their own
    // knockdown reaction).
    if (!isAir && !launched) {
      victim.stun += hitDef.damage.hit;
      if (victim.stun >= STUN_MAX && victimCharacter.states['dizzy']) {
        targetState = 'dizzy';
        victim.stun = 0;
      }
    }

    victim.stateId = targetState;
    victim.stateTime = 0;
    applyStateHeader(victim, victimCharacter, targetState);

    victim.vel.x = v.x * attacker.facing;
    victim.vel.y = v.y;

    victim.hitPause = hitDef.pauseTime.p2;
    attacker.moveHit = true;
  } else {
    // Blocked: chip damage, blockstun pushback, into the matching guard state.
    victim.life -= hitDef.damage.guard;
    if (victim.life < 0) victim.life = 0;

    victim.stateId = defense;
    victim.stateTime = 0;
    applyStateHeader(victim, victimCharacter, defense);

    const gv = hitDef.guardVelocity ?? { x: Math.max(2, hitDef.groundVelocity.x * 0.5), y: 0 };
    victim.vel.x = gv.x * attacker.facing;
    victim.vel.y = defense === 'guard.air' ? gv.y : 0;

    victim.hitPause = hitDef.pauseTime.p2;
    attacker.moveGuarded = true;
  }

  attacker.hitPause = hitDef.pauseTime.p1;
  attacker.activeHitDef = null;
}
