# Moveset gap closure — design & status

Closing the highest-leverage gaps between the current engine and a full MUGEN
character (reference: Ultimate E. Honda — charge specials, command grabs, supers,
guard, power meter, ~40 sctrl types).

**Status (2026-06-02): rounds 1–7 all shipped**, plus follow-on gameplay/art work
(see "Post-round-7" below). Round 1 landed three **file-disjoint** tracks (below);
round 2 (throws), round 3 (guard), round 4 (E. Honda validation), round 5
(canonical action vocabulary), round 6 (complete base reference + action gallery),
and round 7 (KFM action template) have since shipped. M8 determinism stays green;
294 tests pass. Remaining work is tracked under **Deferred**.

## Track 1 — Charge & held-direction motions (`src/engine/commands.ts`)

The motion string grammar gains two step kinds. `motion` stays a `string` (no
schema change); `parseMotion` understands the new tokens.

- **Charge** `[dir]N` — hold `dir` for ≥N consecutive ticks before the release
  steps. `MotionStep` gains `charge?: number`. Charge run is counted backward
  over the buffer independent of the post-release `bufferTicks` window.
  - Headbutt: `"[B]30,F,x"` · Sumo Splash: `"[D]30,U,a"`
- **Held-direction** `/dir` — the step is matched as _held_ (no release-edge
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

## Round 4 — End-to-end validation: E. Honda demo character (DONE)

`src/sandbox/honda.ts` patches the `base` moveset into an E. Honda-style fighter
that exercises every round 1–3 feature together, and is wired into the sandbox
roster (reuses the base atlas). Proven by `test/honda.test.ts` (9 tests) which
drives real input scripts through `tick`:

- **Sumo Headbutt** — `[B]35,F,x` charge special (and a no-charge input correctly
  does _not_ fire it).
- **Sumo Splash** — `[D]35,U+a` charge anti-air (up+button resolves before jump).
- **Hundred Hand Slap** — `y,y,y` mash (y is unbound in base, so no normal eats it).
- **Super Headbutt** — `[B]45,F,x+z` gated on `power>=1000`; drains the meter and
  falls through to the regular headbutt without meter.
- **Oicho Throw** — `~F,DF,D,DB,B,b` HCB command grab via the Throw subsystem.
- Specials are prepended to stand/walk/crouch (cancelable while charging) and
  build power; a 600-tick two-world replay confirms Honda is deterministic.

## Round 5 — Canonical action vocabulary + procedural poses (DONE)

`src/render/poses.ts` defines the shared "basic action" set every move maps onto.

- **`CANONICAL_ACTIONS`** — the documented vocabulary (movement / attack ×
  stance×strength / special / super / throw / guard / hurt / thrown / system).
  This is the authoring + art target: a fully-realised character supplies one
  animation per id (hand-drawn or NB2-generated), so any character slots into the
  same set.
- **`actionGroup(id)`** pattern-matches _ad-hoc_ anim ids too (`standHP`,
  `special.slap`, `guard.crouch`…), so existing characters classify for free.
- **`poseFor(id, frame, baseColor)`** → a distinct, colour-coded silhouette per
  group (attack=white, special=orange, super=gold, throw=green, guard=blue,
  hurt=red, thrown=purple, movement=player tint), with a forward limb bar that
  extends on a strike's active frame. The procedural renderer (`fighter.ts`)
  draws it, so a character with NO sprite art is still fully legible for testing.
- Honda's specials now use canonical anim ids (`special.headbutt`,
  `super.headbutt`, `throw.start/execute`, `special.splash/slap`) and the sandbox
  renders Honda procedurally — every move reads as its own pose/colour.

## Round 6 — Complete reference base + action gallery (DONE)

- **(a) `base` is now a complete canonical reference.** `characters/base/character.json`
  declares an animation for _every_ `CANONICAL_ACTIONS` id (reusing the placeholder
  atlas), so it's the authoring/art template and the gallery's sprite path resolves
  for it. A bun check asserts "all canonical actions covered"; determinism/schema
  tests stay green.
- **(b) Action gallery** (`src/game/mountGallery.ts` + a sandbox mode toggle).
  Cycles the selected fighter through every canonical action, labelled by id +
  group + description with the group colour. Sprite-backed when the character has
  that anim + an atlas (base), else the procedural pose (Honda). Controls: ←/→
  step, Space play/pause, auto-advance otherwise. Great for eyeballing art
  coverage and reading each pose.

## Round 7 — KFM action template (sheet row → action mapping) (DONE)

The MUGEN action sheet is now a reusable **character template**: each row maps to
preset actions, and a generated/retextured sheet with the same layout slots in.

- **`templateManifest.ts`** — `DEFAULT_TEMPLATE_MANIFEST` rewritten to the KFM
  sheet's 13 detected bands (frame counts verified: 5,6,7,4,6,5,6,11,6,10,7,2,6),
  mapping ~36 per-action sprite keys to `(row, frac)` where `frac = index/(len-1)`.
  Rows: 0 idle · 1 walk · 2 light-jump · 3 high-jump · 4 dash · 5 guard
  (stand+crouch) · 6 punch (stand+crouch) · 7 kick (stand/crouch/jump-attack/
  charged) · 8 charged-punch · 9 hit (stand+crouch) · 10 knockdown+getup · 11
  lying/OTG · 12 props.
- **`src/sandbox/kfmTemplate.ts`** — `KFM_TEMPLATE`: reuses `base`'s state machine
  but its animations reference the per-action sprite keys, so `bakeFromSheet`
  slices the right frame per action. The sandbox bakes KFM through it; the gallery
  shows each action with the correct sheet frame.
- A mapping sim asserts every template sprite key resolves to its intended row.

NOTE: animation/art mapping is wired; the _gameplay rules_ the spec describes
(¼-damage guard chip, hold-to-charge, OTG max-3 with crouch light kick, launch-
vs-in-place knockdown, get-up) still ride on `base`'s state machine and are the
next gameplay pass. Frame `frac` values are best-effort and meant to be tuned by
eye in the gallery.

## Post-round-7 — gameplay, demo character & CPU (DONE)

Work that shipped after the rounds above (commits `120cf87`, `0845ebe`, `1b99e61`,
`2d3b183`):

- **Dizzy/stun meter** (`hitDef.ts`/`world.ts`): clean grounded hits accumulate
  stun (by damage), bleeding off only outside hitstun, so combos dizzy but spaced
  pokes don't. At `STUN_MAX` the victim routes to a `dizzy` state (if defined).
- **Launch → knockdown → getup** + **OTG**: launched victims (`hit.air`) crash
  into a knockdown→getup instead of landing on their feet. `enterEndState` makes
  KO (lie down), time-up loss (slump dizzy), and win (pose) read distinctly.
- **Overheads**: jump attacks use `guardFlag 'H'` — a crouch-block can't stop them
  (must stand-block); low/mid attacks stay crouch-guardable.
- **KFM (Kung Fu Man)**: a full 36-action sandbox character on the canonical
  vocabulary — movement/dash/jumps/cross-up, normals, guard, throw→toss→knockdown
  →getup, specials (2-hand punch, hooks/uppercut launchers, charged punch, walking/
  dashing kicks). Renamed from the earlier "kyo2". Offline-baked from a 4K template
  sheet. See `kfm2-character` memory.
- **CPU P2 opponent** (`runtime/ai.ts`): reactive CPU in the **input layer**,
  cadenced off `world.tick` — it never touches the pure `tick`, so M8 is
  unaffected. 5 selectable difficulty levels (standstill / easy / normal / hard /
  expert); expert react-guards in the correct stance (crouch-blocks lows,
  stand-blocks overheads). Online-first model: human drives P1, CPU drives P2. ON
  in the game page + sandbox, OFF in the creator's free-experiment playtest.

## Deferred (next round)

- **Throw escapes / teching**, air throws.
- **Guard meter / guard-crush, parries, pushblock** (advanced defense).
- De-hardcode `'stand'`/`'ko'`/`'hit.*'`/`'guard.*'` transition literals in
  `tick.ts`/`hitDef.ts` so reactions are fully author-controlled.
- Real Honda sprite art (the demo reuses base placeholder sprites).
