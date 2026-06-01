# Moveset gap closure — design & status

Closing the highest-leverage gaps between the current engine and a full MUGEN
character (reference: Ultimate E. Honda — charge specials, command grabs, supers,
guard, power meter, ~40 sctrl types). **Round 1** landed three **file-disjoint**
tracks (below); **round 2** (throws) and **round 3** (guard) have since shipped.
Remaining work is tracked under **Deferred**.

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

## Round 2 — Throws / command grabs (DONE)

Range-based grab subsystem (`src/engine/throw.ts`):

- New **`Throw` controller** + `ThrowDef` (range, damage, `attackerState`,
  `releaseState`, `bindTime`, `bindPos`, `throwVel`). Validated: `attackerState`
  must be a known state; `releaseState` is a victim state (runtime fallback:
  `releaseState` → `hit.air` → `stand` → fail-safe `ctrl:true`).
- `Player.activeThrow` (armed grab, mirrors `activeHitDef`) and `Player.bind`
  (`BindState`: thrower index, countdown, hold offset, release velocity/state).
- `detectThrows` (front + body-distance + height, grounded, un-bound, non-KO) →
  `applyThrows` (binds victim, sends attacker to its throw state) → `applyBinds`
  (re-locks victim each tick; releases on timer expiry, thrower regaining
  control, or thrower KO).
- `tick.ts` resolves throws **before** strikes (grab beats a same-frame attack);
  bound players are skipped by their own state machine, physics, hit-detection,
  and push-collision. Determinism replay (1800 ticks) exercises the path and
  still hashes identically.

Intentional first-cut choices (documented in `throw.ts`): grabs beat everything
(no tech yet), the grab is armed for the grab state's duration, and mutual
same-frame grabs resolve in player-index order.

## Round 3 — Guard / blocking (DONE)

Automatic block resolution in `applyHit` (`src/engine/hitDef.ts`):

- A victim **blocks** when in a neutral (`moveType: 'I'`) state, holding away from
  the attacker, in a guard position the HitDef's `guardFlag` permits (`H`igh /
  `L`ow / `M`id / `A`ir), and the matching `guard.stand` / `guard.crouch` /
  `guard.air` state exists. Wrong position (e.g. crouch-guarding a high) lands as
  a hit — that's the high/low mixup.
- Block outcome: `damage.guard` chip, blockstun pushback (new optional
  `HitDef.guardVelocity`, default = scaled `groundVelocity`), into the guard state.
- **Wired up the previously-dead move flags**: real `Player.moveHit` /
  `moveGuarded` (set in `applyHit`, reset on `ChangeState`, read by `evalFlag`).
  `moveContact = moveHit || moveGuarded`. Enables hit-confirm / on-block cancels.
- Determinism replay still hashes identically (blocking is fully deterministic —
  guard decision reads the victim's buffered input + positions).

## Deferred (next round)

- **Throw escapes / teching**, air throws, command-grab motions (the `[charge]`
  and `/held` grammar from round 1 is ready to author these).
- **Guard meter / guard-crush, parries, pushblock** (advanced defense).
- De-hardcode `'stand'`/`'ko'`/`'hit.*'`/`'guard.*'` transition literals in
  `tick.ts`/`hitDef.ts` so reactions are fully author-controlled.
- Author Honda's actual charge specials onto a character now that the grammar,
  meter, throws, and guard all exist (end-to-end validation in the sandbox).
