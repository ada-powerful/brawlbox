// Lightweight reactive CPU. Lives in the INPUT layer — it reads the pre-tick
// `World` and returns a button bitmask for one player, exactly like a keyboard
// poll would. It never runs inside (or mutates) the pure `tick`, so the M8
// determinism guarantees are untouched. Decisions are cadenced off `world.tick`
// (no Math.random), so a given match replays identically.
//
// This is the stand-in opponent until real online versus lands: the human drives
// P1, the CPU drives P2. Difficulty scales from a do-nothing dummy up to an
// aggressive expert that guards in the correct stance and anti-airs.
import type { Character } from '../engine/schema.ts';
import { Btn, type World } from '../engine/world.ts';

export type CpuLevel = 'standstill' | 'easy' | 'normal' | 'hard' | 'expert';

/** User-facing difficulty options, ordered easiest → hardest. */
export const CPU_LEVELS: { id: CpuLevel; label: string }[] = [
  { id: 'standstill', label: 'Standstill (dummy)' },
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
  { id: 'expert', label: 'Expert' },
];

interface Behavior {
  attackPhase: number; // poke-cycle length in ticks (smaller = attacks more often)
  blockPct: number; // 0..100 — share of frames spent guarding when pressured
  reactGuard: boolean; // pick crouch vs stand guard based on the incoming attack
  jumpInEvery: number; // ticks between hop-in overheads (0 = never)
  antiAir: boolean; // swat a close airborne opponent with a standing heavy
  aggro: number; // 0..100 — how persistently it walks into range (lower = hangs back)
  light: boolean; // only throw light pokes (no heavy/step-in) — keeps offense weak
}

// `null` = the standstill dummy (no inputs at all).
const BEHAVIOR: Record<CpuLevel, Behavior | null> = {
  standstill: null,
  easy: {
    attackPhase: 110,
    blockPct: 18,
    reactGuard: false,
    jumpInEvery: 0,
    antiAir: false,
    aggro: 40,
    light: true,
  },
  normal: {
    attackPhase: 70,
    blockPct: 55,
    reactGuard: false,
    jumpInEvery: 200,
    antiAir: false,
    aggro: 100,
    light: false,
  },
  hard: {
    attackPhase: 46,
    blockPct: 80,
    reactGuard: false,
    jumpInEvery: 120,
    antiAir: true,
    aggro: 100,
    light: false,
  },
  expert: {
    attackPhase: 32,
    blockPct: 94,
    reactGuard: true,
    jumpInEvery: 84,
    antiAir: true,
    aggro: 100,
    light: false,
  },
};

const STRIKE = 88; // within poke range
const APPROACH = 230; // start walking in beyond this gap

export function cpuInput(
  world: World,
  characters: Record<string, Character>,
  selfIdx: number,
  level: CpuLevel = 'normal',
): number {
  if (world.matchOver) return 0;
  const b = BEHAVIOR[level];
  if (!b) return 0; // standstill dummy

  const self = world.players[selfIdx];
  const opp = world.players[selfIdx === 0 ? 1 : 0];
  if (!self || !opp) return 0;

  const dx = opp.pos.x - self.pos.x;
  const dist = Math.abs(dx);
  const toward = dx >= 0 ? Btn.Right : Btn.Left;
  const away = dx >= 0 ? Btn.Left : Btn.Right;
  const t = world.tick;

  // Airborne (our own jump-in): heavy kick — an overhead — and keep drifting in.
  if (self.pos.y > 0) {
    return (dist < 130 ? Btn.C : 0) | (dist > 40 ? toward : 0);
  }

  // Anti-air: opponent is airborne and close — poke up with a standing heavy.
  if (b.antiAir && opp.pos.y > 24 && dist < 110) return Btn.C;

  // Under pressure: guard. Expert reads the attack and guards in the right stance
  // (jump-in = overhead → stand-block; crouching attack = low → crouch-block).
  const oppState = characters[opp.characterId]?.states[opp.stateId];
  if (oppState?.moveType === 'A' && dist < STRIKE + 34 && t % 100 < b.blockPct) {
    if (b.reactGuard && opp.pos.y === 0 && oppState.type === 'C') return Btn.Down | away; // low
    return away; // overhead / mid → stand-block
  }

  // Approach, gated by aggression — a low-aggro CPU walks in only in bursts and
  // otherwise hangs back, so it pressures a beginner far less.
  const advancing = t % 100 < b.aggro;
  if (dist > APPROACH) return advancing ? toward : 0;
  if (dist > STRIKE) {
    if (b.jumpInEvery > 0 && t % b.jumpInEvery < 8) return toward | Btn.Up;
    return advancing ? toward : 0;
  }

  // In striking range: cycle a small poke string, deterministic on the tick. A
  // 'light' CPU sticks to light pokes; tougher ones mix in heavies and step-ins.
  const phase = t % b.attackPhase;
  const q = b.attackPhase / 4;
  if (phase < 5) return Btn.A; // light kick
  if (phase >= q && phase < q + 5) return Btn.X; // light punch
  if (b.light) return 0;
  if (phase >= 2 * q && phase < 2 * q + 5) return Btn.C; // heavy kick
  if (phase >= 3 * q && phase < 3 * q + 5) return toward | Btn.X; // step-in jab
  return 0; // brief neutral between pokes
}
