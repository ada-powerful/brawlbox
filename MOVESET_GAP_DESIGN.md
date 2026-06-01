# Moveset gap closure — round 1 design

Closing the highest-leverage gaps between the current engine and a full MUGEN
character (reference: Ultimate E. Honda — charge specials, command grabs, supers,
guard, power meter, ~40 sctrl types). This round implements three **file-disjoint**
tracks; throws and guard are designed in a follow-up.

## Track 1 — Charge & held-direction motions (`src/engine/commands.ts`)

The motion string grammar gains two step kinds. `motion` stays a `string` (no
schema change); `parseMotion` understands the new tokens.

- **Charge** `[dir]N` — hold `dir` for ≥N consecutive ticks before the release
  steps. `MotionStep` gains `charge?: number`. Charge run is counted backward
  over the buffer independent of the post-release `bufferTicks` window.
  - Headbutt: `"[B]30,F,x"`  · Sumo Splash: `"[D]30,U,a"`
- **Held-direction** `/dir` — the step is matched as *held* (no release-edge
  gap required). `MotionStep` gains `hold?: boolean`. For proximity throws: `"/F,z"`.

## Track 2 — Full 6-button normal moveset (`characters/base/character.json`)

Author with existing primitives only. Button map (MUGEN/SF): x/y/z = LP/MP/HP,
a/b/c = LK/MK/HK. Standing LP/HP/LK/HK, crouching LP/HK (from `crouch`), one
jumping attack (from `jump`). Placeholder sprites reuse existing anims. Keeps
`parseCharacter` + determinism test green.

## Track 3 — Opponent triggers + power meter (`schema.ts`, `triggers.ts`, `world.ts`, `stateMachine.ts`)

- Fix `life` value ref to read the real life (was hardcoded `1000`).
- New `Value` refs: `p2BodyDist`, `p2Dist.x`, `p2.pos.y`, `p2.life`, `p2.stateNo`.
  Opponent = the other player index (2-player assumption).
- `power` on `Player` (+ `MAX_POWER`), a `power` value ref, `PowerAdd`/`PowerSet`
  controllers (clamped to `[0, MAX_POWER]`). Additive ⇒ determinism-safe.

## Deferred (next round, coupled / not independent)

- **Throws / command grabs**: target binding (one player drives another's state),
  throw-class HitDef handling in `applyHit`. Touches `hitDef.ts` + `world.ts`.
- **Guard / blocking**: block detection, `guardFlag`/chip, guard states. Touches
  `applyHit` + new states.
- De-hardcode `'stand'`/`'ko'`/`'hit.*'` transition literals in `tick.ts`/`hitDef.ts`.
