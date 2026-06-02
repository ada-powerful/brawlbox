// Lightweight reactive CPU. Lives in the INPUT layer — it reads the pre-tick
// `World` and returns a button bitmask for one player, exactly like a keyboard
// poll would. It never runs inside (or mutates) the pure `tick`, so the M8
// determinism guarantees are untouched. Decisions are cadenced off `world.tick`
// (no Math.random), so a given match replays identically.
//
// This is the stand-in opponent until real online versus lands: the human drives
// P1, the CPU drives P2. It's deliberately simple — approach, mix up a few pokes,
// hop in for the occasional overhead, and stand-block when pressured — enough to
// be a moving, hitting sparring partner rather than a strong AI.
import type { Character } from '../engine/schema.ts';
import { Btn, type World } from '../engine/world.ts';

const STRIKE = 88; // within poke range
const APPROACH = 230; // start walking in beyond this gap

export function cpuInput(world: World, characters: Record<string, Character>, selfIdx: number): number {
  if (world.matchOver) return 0;
  const self = world.players[selfIdx];
  const opp = world.players[selfIdx === 0 ? 1 : 0];
  if (!self || !opp) return 0;

  const dx = opp.pos.x - self.pos.x;
  const dist = Math.abs(dx);
  const toward = dx >= 0 ? Btn.Right : Btn.Left;
  const away = dx >= 0 ? Btn.Left : Btn.Right;
  const t = world.tick;

  // Airborne (a jump-in): throw a heavy kick — an overhead — and keep drifting in.
  if (self.pos.y > 0) {
    return (dist < 130 ? Btn.C : 0) | (dist > 40 ? toward : 0);
  }

  // Under pressure up close: hold back to stand-block, but not every frame (so it
  // still eats some hits and isn't an impenetrable wall).
  const oppState = characters[opp.characterId]?.states[opp.stateId];
  if (oppState?.moveType === 'A' && dist < STRIKE + 30 && t % 90 < 60) {
    return away;
  }

  if (dist > APPROACH) return toward; // close the gap
  if (dist > STRIKE) {
    return t % 200 < 8 ? toward | Btn.Up : toward; // mostly walk, occasional hop-in
  }

  // In striking range: cycle a small poke string, deterministic on the tick.
  const phase = t % 70;
  if (phase < 5) return Btn.A; // light kick
  if (phase >= 18 && phase < 23) return Btn.X; // light punch
  if (phase >= 40 && phase < 45) return Btn.C; // heavy kick
  if (phase >= 58 && phase < 62) return toward | Btn.X; // step-in jab
  return 0; // brief neutral between pokes
}
