# ftg — Phase 1 Plan

A from-scratch, browser-native 2D fighting game engine. Phase 1 ships the smallest playable demo that proves the engine model is right and rollback-ready. Phase 2+ adds the AI-assisted character creator on top of an engine we trust.

> **Reviewed:** 2026-04-25 by `/plan-eng-review`. Decisions logged in §10.

## 1. Goal — the done bar

**Two hand-authored stick-figure fighters in a single stage. Walk, jump, punch, hit each other, KO. Deterministic enough to support rollback netcode later. Deployed to a public URL.**

Concrete acceptance test: load the same character JSONs and the same input log into two `World` instances, advance both 60 ticks/sec for 30s, hash a canonical serialization at every tick, assert hash-equality. If that passes, the engine model is correct.

## 2. Non-goals (deferred to phase 2+)

- Any AI-driven character creation (whole point of phase 2; phase 1 hand-authors the test characters).
- MUGEN data-format compatibility (`.cns`/`.air`/`.sff`/`.snd` parsing). Native JSON + PNG only.
- Throws, custom-state hits, `p2stateno` puppeting. Phase 1 is strikes only.
- Helpers, projectiles, explods. Hit sparks via a single `ParticleContainer`; that's it.
- Charge moves, 360 motions, negative edge, strict-next (`>`) notation.
- Juggle system — air-hits just don't combo in phase 1.
- AfterImage, PalFX, EnvShake, SuperPause, screen-fill effects.
- Sound mixing / spatial audio — `new Audio().play()` is fine.
- Netcode. But the engine **must be designed to drop netcode in later** (see §3).
- Round system, character select, menus, story mode.
- Cross-machine determinism (floats are fine for local-only; fixed-point is phase-3 if needed).

## 3. Architectural commitments (these are load-bearing)

These four decisions exist to make rollback netcode a future drop-in instead of a rewrite. Even if phase 1 is local-only, every line of engine code must respect them.

1. **Pure simulation:** `tick(world: World, inputs: Inputs): World`. No I/O, no DOM, no `Date.now()`, no `Math.random()` inside `tick`. RNG seeded from `world.tick`. Render reads `world` and is forbidden to mutate it.
2. **Single `World` struct:** every piece of game state — players, entities, particles, RNG, tick counter — lives in one tree, no closures or external refs. `structuredClone(world)` is the phase-1 save-state primitive (good enough for the M8 determinism test); phase-3 rollback will replace it with a typed `saveState(world): Uint8Array` / `loadState(buf): World` pair so per-frame snapshot cost stays sub-ms.
3. **Stable iteration order:** entities live in arrays sorted by integer ID, never plain `Map`s with insertion-order semantics. New entities get monotonically increasing IDs. `players` is a `Player[]` (variable-length), not a hardcoded `p1`/`p2` pair.
4. **Fixed 60Hz simulation, decoupled render:** `requestAnimationFrame` drives an accumulator that calls `tick` 0–N times per frame. Render is interpolated between the last two `World` snapshots.

We're not implementing rollback in phase 1, but if any phase-1 code violates these rules it's a bug, not a tradeoff.

### Hit-pause clock semantics (specified, not asked)

When a HitDef lands, both players enter hit-pause for `pauseTime` ticks. During hit-pause:

- ✅ Input buffers continue accumulating (so a buffered cancel works on unfreeze).
- ✅ `world.tick` continues incrementing (it's the simulation clock).
- ❌ Per-player `stateTime` does NOT advance.
- ❌ Animation frame counters do NOT advance.
- ❌ Physics integration (`pos += vel`) does NOT run.
- ❌ Trigger evaluation does NOT run for paused players (no controllers fire).

Symmetric pause is the phase-1 simplification. Real fighters often pause only the attacker (P1 hit-pause) while the defender shakes; we'll revisit if it matters in playtest.

### Push collision (specified, not asked)

When two players' body boxes overlap and both are grounded: each pushes the other by `overlap/2` outward along x. When one is airborne: only the grounded one displaces. When one is against the screen edge (corner): the cornered player can't move, the other is pushed back by full overlap. No push during hit-pause.

## 4. Tech stack (locked)

| Concern               | Choice                                                | Why                                                                                     |
| --------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Language              | TypeScript (strict)                                   | Type-safe state machine, schema validation                                              |
| Build                 | Vite                                                  | Fast HMR, bun/pnpm-friendly                                                             |
| Renderer              | PixiJS pinned to `~8.6.0`                             | Sprite batching done. Pin exact patch — v8 ParticleContainer API churned during 2024–25 |
| Schema                | Zod, with `z.infer` for types                         | Single source of truth — never write TS types and Zod schemas separately                |
| Tests                 | Vitest                                                | Determinism tests, schema fuzz                                                          |
| Math                  | `number` (float64), wrapped in `Vec2` helpers         | Local-only rollback OK with floats. Wrapping leaves room to swap to fixed-point later   |
| Asset pipeline        | Aseprite → JSON-array export                          | Standard format, free tooling, atlas+frame metadata in one file                         |
| Package mgr / runtime | bun                                                   | Already on machine; faster install + native test runner                                 |
| Hosting               | Any static host (Vercel / Cloudflare Pages / Netlify) | Build emits `dist/`; platform-neutral. Pick one at deploy time                          |

Open for phase 2 (don't decide now): creator-UI framework, backend/proxy posture, online-play library (likely [`@tboyt/telegraph`](https://www.npmjs.com/package/@tboyt/telegraph)).

## 5. Data model — `Character` JSON schema

Designed to be (a) the LLM target in phase 2, (b) hand-writable in phase 1, (c) trivially serializable. Schema is defined once in Zod; TS types come from `z.infer`. Sketch (real impl in `engine/schema.ts`):

```ts
// All types below are z.infer<typeof FooSchema> — no hand-written duplicates.

type Character = {
  meta: { id: string; name: string; author: string; version: string };
  data: {
    life: number;
    attack: number;
    defence: number;
    walkFwd: number;
    walkBack: number;
    jumpVel: { x: number; y: number };
    gravity: number;
    groundFriction: number;
  };
  size: { width: number; height: number; headY: number };
  spriteAtlas: { url: string; frames: Record<string, FrameRect> };
  animations: Record<AnimId, Animation>; // keyed by string id
  states: Record<StateId, State>; // keyed by string id, NOT array
  commands: Command[]; // ordered: textual order = priority
  sounds: Record<string, string>; // id -> .ogg url
};

type StateId = string; // 'stand' | 'walk' | 'jump.start' | 'hit.stand' | 'ko' | 'punch.light' | ...
type AnimId = string;

type Animation = {
  loop: boolean;
  frames: AnimFrame[];
};
type AnimFrame = {
  sprite: string; // key into spriteAtlas.frames
  duration: number; // ticks; -1 = hold last (state-change is the only exit)
  offset: { x: number; y: number };
  hurtboxes: AABB[]; // Clsn2
  hitboxes: AABB[]; // Clsn1
};
type AABB = { x: number; y: number; w: number; h: number };

type State = {
  id: StateId;
  type: 'S' | 'C' | 'A' | 'L'; // stand | crouch | air | lie
  moveType: 'A' | 'I' | 'H'; // attack | idle | hit
  physics: 'S' | 'C' | 'A' | 'N'; // stand-friction | crouch-friction | gravity | none
  anim?: AnimId;
  velSet?: { x?: number; y?: number };
  ctrl?: 0 | 1;
  controllers: Controller[];
};

type Controller =
  | { type: 'ChangeState'; value: StateId; ctrl?: 0 | 1; trigger: Trigger }
  | { type: 'ChangeAnim'; value: AnimId; trigger: Trigger }
  | { type: 'VelSet'; x?: number; y?: number; trigger: Trigger }
  | { type: 'VelAdd'; x?: number; y?: number; trigger: Trigger }
  | { type: 'CtrlSet'; value: 0 | 1; trigger: Trigger }
  | { type: 'HitDef'; def: HitDef; trigger: Trigger }
  | { type: 'PlaySnd'; id: string; trigger: Trigger }
  | { type: 'LifeAdd'; value: number; trigger: Trigger };

// Triggers are a JSON AST — LLM-friendly, Zod-validatable, no string parsing.
type Trigger =
  | { op: 'and' | 'or'; args: Trigger[] }
  | { op: 'not'; arg: Trigger }
  | { op: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'; left: Value; right: Value }
  | { op: 'flag'; name: 'ctrl' | 'moveContact' | 'moveHit' | 'moveGuarded' }
  | { op: 'command'; name: string }; // checks named command in input buffer

type Value =
  | { const: number | string | boolean }
  | { ref: 'time' | 'animTime' | 'animElem' | 'stateNo' | 'vel.x' | 'vel.y' | 'pos.y' | 'life' };

type HitDef = {
  attr: { state: 'S' | 'C' | 'A'; class: 'NA' | 'SA' | 'HA' | 'NT' | 'ST' | 'HT' };
  damage: { hit: number; guard: number };
  hitFlag: string; // 'MAF'
  guardFlag: string; // 'MA'
  pauseTime: { p1: number; p2: number };
  groundHitTime: number;
  groundVelocity: { x: number; y: number };
  airVelocity: { x: number; y: number };
  priority: number; // phase-1: higher wins, equal trades, no Hit/Miss/Dodge classes
  fall?: boolean;
  sound?: string;
};

type Command = {
  name: string; // 'qcf_x', 'punch'
  motion: string; // mini-notation: '~D, DF, F, x' | 'x' | 'F+x'  (motion strings ARE OK; not part of the per-tick eval hot path)
  bufferTicks: number; // default 15
};
```

**Why state IDs are strings and triggers are AST:** the long-term author is an LLM. JSON ASTs and named state IDs survive LLM round-trips without parse errors; numeric magic numbers and string mini-DSLs do not. (Motion strings stay as strings — they're parsed once at character load, not per tick, and a small grammar reads cleaner than nested AST for sequences.)

### Base character inheritance (specified)

Two characters are authored:

- `base/character.json` — every state every fighter inherits: `'stand'`, `'walk'`, `'crouch'`, `'jump.start'`, `'jump.up'`, `'jump.land'`, `'guard.stand'`, `'guard.crouch'`, `'hit.stand'`, `'hit.crouch'`, `'hit.air'`, `'ko'`. No attacks.
- `stick/character.json` — declares `extends: 'base'`, adds `'punch.light'` only.

Merge semantics: `mergeCharacter(base, override)` returns a new Character where:

- `meta` is from override.
- `data`/`size` are deep-merged, override wins on primitives.
- `animations`, `states`, `sounds` are key-merged: override entry replaces base entry at the same key entirely (no per-field merge inside a state; if you override `'stand'`, you replace the whole state).
- `commands` is `[...base.commands, ...override.commands]` — order matters (override commands have higher priority, since first-match-wins).
- `spriteAtlas` is from override (atlas is per-character).

Both fighters in phase 1 are visually identical (same atlas, mirrored on x). Asymmetry, palette swap, and per-character sprites are phase-2 problems.

## 6. Folder structure

```
ftg/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    engine/                # pure simulation, NO pixi/dom imports
      world.ts             # World struct + factory
      tick.ts              # tick(world, inputs) -> world
      stateMachine.ts      # interpreter: statedef + controllers
      triggers.ts          # AST evaluator (pure function of trigger + ctx)
      animation.ts         # frame advance, hit/hurtbox lookup
      collision.ts         # AABB pairwise hit detection + push collision
      hitDef.ts            # apply HitDef to victim
      commands.ts          # input ring buffer + motion parser
      merge.ts             # mergeCharacter(base, override)
      rng.ts               # seedable, frame-deterministic
      vec.ts               # Vec2 helpers (swap to fixed-point later)
      schema.ts            # Zod schemas (single source of truth) + z.infer types
      serialize.ts         # canonical World -> string for determinism hash
    render/                # impure, PixiJS, reads world only
      app.ts               # PixiJS Application bootstrap
      stage.ts             # background draw
      fighter.ts           # one Sprite per player
      fx.ts                # ParticleContainer hit sparks
      debug.ts             # Clsn1/Clsn2 overlay, state HUD
    input/
      keyboard.ts          # KeyboardEvent -> per-tick Inputs
      gamepad.ts           # Gamepad API -> per-tick Inputs
    runtime/
      loop.ts              # rAF + accumulator + interpolation
      assets.ts            # load atlas PNG + Aseprite JSON
    main.ts                # wire everything
  characters/
    base/
      character.json
      atlas.png
      atlas.json           # Aseprite JSON-array export
    stick/
      character.json       # extends: 'base'
  test/
    determinism.test.ts    # the done-bar test
    triggers.test.ts       # AST evaluator: every op + every ref + edge cases
    commands.test.ts       # motion parser + buffer + priority order
    animation.test.ts      # duration=-1 hold, loop wrap, hitbox keyframe lookup
    collision.test.ts      # AABB pairs, push collision, HitDef trade rules
    merge.test.ts          # base+override key-merge, command order
    schema.test.ts         # Zod schema accepts/rejects examples
```

## 7. Milestones (estimated solo-dev pace)

Each milestone is a single focused branch ending with a green test or a visible demo. Times are rough.

**M0 — Bootstrap (½ day)**
Vite + TS-strict + Pixi `~8.6.0` + Vitest + prettier + Zod. Empty Pixi window renders a colored rectangle. CI runs `tsc --noEmit && vitest run`. **Deploy step: `pnpm build && vercel deploy --prod` (or Cloudflare Pages). The engine ships to a public URL from M0 onward — every milestone is playable in a browser by anyone with the link.**

**M1 — World + Loop (1 day)**
`World` struct with `players: Player[]` length 2. `tick(world, inputs)` increments tick counter and applies hardcoded velocities on input. rAF accumulator drives 60Hz sim with render interpolation. Render: two colored rectangles. **Demo: WASD moves left rect, arrows move right rect, motion is buttery at 60Hz.**

**M2 — State machine interpreter + trigger AST (2 days)**
Zod schema in `engine/schema.ts`. AST trigger evaluator in `engine/triggers.ts` (pure: `evalTrigger(trigger, ctx) → boolean`). StateDef registry, controller dispatch by `type` field. Hand-write a 3-state character JSON (`stand`/`walk`/`jump.start`). Replace M1's hardcoded movement with state transitions driven by inputs. **Tests: `triggers.test.ts` covers every op (and/or/not, eq/ne/lt/le/gt/ge), every `ref` value, every `flag`, edge cases (animTime when frame held, time on state entry).** **Demo: rect plays correct state per input.**

**M3 — Animation player (1 day)**
Frame advance with per-frame `duration` + loop semantics + `duration = -1` hold-last. Sprite atlas loader (Aseprite JSON-array). Replace rect with actual stick-figure sprite, per-frame swap. **Tests: `animation.test.ts` covers duration=-1 hold, explicit loop wrap, hitbox/hurtbox keyframe lookup at any tick.** **Demo: walk animation cycles, idle holds.**

**M4 — Input system (1 day)**
Keyboard + Gamepad. Per-tick `Inputs` struct (button bitmask + dir). Ring buffer of last 60 inputs per player. Motion parser for sequences (`~D, DF, F, x`). `{op: 'command', name: 'qcf_x'}` trigger works. **Tests: `commands.test.ts` covers sequence motion, simultaneous press (`F+x`), buffer expiry boundary (15 vs 16 ticks), button-only commands, textual-order priority.** **Demo: a fireball motion logs to console.**

**M5 — Hitboxes + collision (2 days)**
Author hitbox/hurtbox keyframes for a punch animation. AABB pairwise scan each tick. HitDef application: life delta, knockback velocity, transition to `'hit.stand'` / `'hit.air'`, hit-pause per §3 spec. Push collision per §3 spec. **Tests: `collision.test.ts` covers AABB overlap edge cases, push collision (grounded/grounded, grounded/airborne, corner-pinned), HitDef trade rules (higher wins / equal trades).** **Demo: punch deals damage and knocks opponent back.**

**M6 — Match flow (1 day)**
KO detection (`life <= 0` → `'ko'` state → freeze). Win declaration overlay. `R` resets `World`. **Demo: full KO loop, restart.**

**M7 — Debug overlay + polish (1 day)**
Press `F1` to draw Clsn1/Clsn2 boxes, current `stateId`, anim frame, vel, ctrl, life. **Demo: debug HUD usable for authoring next character.**

**M8 — Determinism harness (1 day)**
`engine/serialize.ts` produces a canonical UTF-8 string for any `World` (sort keys, fixed float formatting, no `Map`/`Set`). Hash with FNV-1a (no crypto needed). Test records 30s input log, replays through two fresh `World` instances, asserts hash-equality at every tick. **Done bar passes.**

Total: roughly 10 working days for a focused solo dev. Two weeks calendar with normal interruptions.

## 8. Risks and how we mitigate

| Risk                                                                | Mitigation                                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floating-point nondeterminism cross-machine                         | Phase 1 is local-only. Wrap math in `Vec2`/`Scalar` so we can swap to fixed-point in phase 3 if needed                                                                          |
| Trigger AST grows verbose for hand-authoring                        | Phase-1 character JSON is small (~30KB). If verbosity hurts iteration, add an Aseprite-side authoring helper, not a string parser                                               |
| State machine semantics drift from MUGEN's                          | Treat MUGEN as reference, not gospel. Document any deviation in `engine/SEMANTICS.md` as we go                                                                                  |
| Pixi rendering bottlenecks                                          | Won't happen at phase-1 scale (~50 sprites). Don't pre-optimize                                                                                                                 |
| Asset pipeline pain (drawing stick figures)                         | Aseprite + JSON-array export. 8 frames per animation × 5 animations = entire phase-1 asset budget                                                                               |
| Schema decisions paint us into a corner for phase 2 (LLM authoring) | The format above was designed with that in mind: JSON-native, AST triggers, string IDs, single Zod source. Revisit at phase-2 kickoff but expect minor additions, not redesigns |
| `structuredClone` perf cliff for rollback                           | Phase-1 only uses it for the M8 test (1800 clones over 30s test, sub-second). Phase-3 rollback work explicitly includes replacing it with `saveState/loadState`                 |
| NaN/Infinity in `vel`/`pos` propagating silently                    | Dev-build assertion at end of `tick`: every `Player.pos` and `Player.vel` must be finite. Throw with state context                                                              |
| `ChangeState` to a state that doesn't exist after merge             | `mergeCharacter` validates: every `ChangeState.value`, `ChangeAnim.value`, every `state.anim` ref must resolve in the merged Character. Throw at load, never at `tick`          |

## 9. What this unlocks for phase 2

When the engine works, the AI-creator pipeline becomes well-scoped:

- LLM emits a `Character` JSON conforming to the Zod schema (validation = free correctness gate).
- gpt-image-2 generates frames per animation, packed into an Aseprite-format atlas.
- The same engine that runs hand-authored characters runs AI-generated ones — no special path.
- Editor UI is "load JSON → playtest in isolation → regenerate any single frame → export bundle."

Phase 1 buys us a known-good substrate. Phase 2 builds the creator on top of it.

## 10. Decisions log (from `/plan-eng-review`)

| #     | Decision                        | Choice                                                            | Rationale                                                                      |
| ----- | ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A1    | Trigger DSL: string vs JSON AST | **JSON AST**                                                      | LLM-friendly; Zod-validatable; no custom parser surface                        |
| A2    | State IDs: numeric vs string    | **String**                                                        | LLM-friendly; readable in code, debug, errors                                  |
| A3    | Hit-pause clock semantics       | Specified in §3                                                   | stateTime/animTime/physics/triggers freeze; input buffer + world.tick continue |
| A4    | `structuredClone` perf          | Phase-1 OK; flagged for phase-3 replacement                       | Sub-second on M8 test; rollback needs typed save/load                          |
| A5    | `players: Player[]` not p1/p2   | **Array**                                                         | Future tag/4-player without rewrite                                            |
| C1    | TS types vs Zod schemas         | **`z.infer`, single source**                                      | No type/schema drift                                                           |
| C2    | Base/override merge             | Key-merge `Record<StateId, State>`, override replaces whole state | Specified in §5                                                                |
| C3    | Atlas format                    | **Aseprite JSON-array**                                           | Standard, free tool, atlas+meta in one file                                    |
| Test  | Coverage gaps                   | Added explicit test files per milestone                           | See §6 + §7                                                                    |
| Perf  | Pixi version                    | **`~8.6.0` pinned**                                               | v8 ParticleContainer churned in 2024–25                                        |
| Scope | Public deploy                   | Added to M0                                                       | Every milestone playable from a URL                                            |
