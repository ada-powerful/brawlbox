# BrawlBox — browser MUGEN engine

> Title was "ftg" — same project, renamed to BrawlBox. Lives in `brawlbox-web`.

Browser-native 2D fighting game engine with a JSON-native character format. Phase 1 (core engine) is complete and has since been **extended well past its original scope** — throws, guard/blocking, charge & held motions, power meter, opponent triggers, dizzy/stun, knockdowns/OTG, and launch/KO flow all shipped (the moveset-gap rounds; see `MOVESET_GAP_DESIGN.md`). Phase 2 (AI-assisted character creator) is mid-build. See `PHASE_1_PLAN.md` / `PHASE_2_PLAN.md` for the original designs.

## Run commands

```
bun install            # one-time / after lockfile change
bun run dev            # Vite dev server, http://localhost:5173
bun run typecheck      # tsc --noEmit, must pass before commit
bun run test           # Vitest suite
bun run build          # production build to dist/
bun run format         # Prettier
```

CI (`.github/workflows/ci.yml`) runs `typecheck`, `test`, and `build` on every push/PR.

## Folder layout

```
src/
  engine/    ← PURE simulation. No pixi / DOM / window imports anywhere.
               tick.ts orchestrates; commands, hitDef, throw, collision,
               stateMachine, triggers, world, schema, serialize.
  render/    ← Pixi-side, reads World, never mutates it. fighter.ts (atlas +
               procedural poses), poses.ts (canonical action vocabulary).
  input/     ← keyboard + gamepad polling.
  runtime/   ← rAF loop + accumulator + interpolation; ai.ts (CPU P2, input-layer).
  game/      ← mountGame (the playable page) + mountGallery (action gallery).
  sandbox/   ← backend-free local test harness; wooden-mannequin demo character + templates.
  stages/    ← render-only parallax stage backgrounds (e.g. hillside).
  creator/   ← React creator UI (prompt → character, sprite gen, playtest).
  ai/        ← LLM / image / fal provider clients (now mostly behind the backend proxy).
characters/  ← hand-authored character JSON + atlas. `base` is the complete
               canonical-action reference template.
test/        ← Vitest suite, file-per-module.
```

`src/main.ts` wires it all together. The engine stays pure regardless of how
much the moveset has grown — render, input, runtime, sandbox, and the CPU all
sit outside `tick`.

## Architectural commitments (load-bearing)

These four are the precondition for rollback netcode in phase 3. Violations are bugs, not tradeoffs.

1. **Pure `tick(world, characters, inputs) → World`.** No `Math.random`, no `Date.now`, no DOM access in tick or anything it calls. Render is forbidden to mutate `World`.
2. **Single `World` struct.** Every piece of mutable state lives in one tree. `structuredClone(world)` must round-trip identically — the M8 determinism test enforces this.
3. **Stable iteration order.** `Player[]` indexed by integer; never `Map`/`Set` in serialized state (they break canonical hashing).
4. **Fixed 60Hz simulation.** Decoupled from rAF render via accumulator + interpolation alpha. The render layer reads `(prev, curr, alpha)` and lerps.

The M8 test (`test/determinism.test.ts`) replays 1800 ticks of seeded random input through two `World` instances and asserts hash equality at every tick. **Must keep passing.**

## TypeScript conventions

- `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` are on.
- `verbatimModuleSyntax` requires `import type { ... }` for type-only imports.
- `noUncheckedIndexedAccess` makes array access return `T | undefined`. Handle the undefined case; don't `as T!` it away unless you've already guarded.

## Schema is the single source of truth

`src/engine/schema.ts` defines Zod schemas. Types come from `z.infer<typeof FooSchema>` — never write parallel TS interfaces for schema-covered shapes.

Recursive types (`Trigger`, `Value`) need hand-typed `z.ZodType<T>` because Zod can't infer recursion. Everything else infers cleanly.

`parseCharacter(json)` validates JSON AND checks `ChangeState`/`ChangeAnim`/`{op:'command'}` references resolve to known states/animations/commands. Use it always; never construct a `Character` directly from raw JSON.

## Trigger expressions are JSON AST

`{ op: 'and', args: [...] }` style, not string mini-DSL. This is what makes phase-2 LLM authoring tractable. Don't add a string parser layer.

## Coordinate conventions

- World pos: `pos.x` is horizontal (matches screen X), `pos.y` is height above ground (positive = airborne; ground at y=0). Render maps to screen via `screenY = GROUND_Y_SCREEN - pos.y`.
- AABB local coords: `{x, y, w, h}` bottom-left anchor. `x=0` is feet center, `y=0` is feet, `+y` is up. Facing flip mirrors x along player axis (handled by `translateBox`).
- HitDef `groundVelocity.x` convention: positive = "knock victim away in attacker's facing direction." World vel = `gv.x * attacker.facing`. (Differs from MUGEN — chosen for LLM friendliness.)

## Test conventions

- Engine modules tested in isolation. No Pixi/DOM imports in tests.
- File-per-module: `test/triggers.test.ts`, `test/collision.test.ts`, etc.
- Tests use `createWorld()` then mutate fields directly — fast and explicit.
- The M8 determinism test is the phase-1 done-bar; do not skip or weaken it.

## What NOT to do

- Don't add `Math.random` anywhere `tick` reaches. RNG must be seeded from `world.tick` if needed.
- Don't store mutable state outside `World` (no module-level state in `engine/`).
- Don't write TS types that duplicate a Zod schema — use `z.infer`.
- Don't add a string trigger DSL "for convenience" — the AST is the format LLMs target in phase 2.
- Don't skip `parseCharacter` — direct JSON-to-`Character` casts bypass reference validation.

## Phase status (updated 2026-06-02)

- **Phase 1: complete** (engine + state machine + animation + commands + collision + match flow + determinism harness).
- **Engine moveset expansion: shipped** (rounds 1–7 of `MOVESET_GAP_DESIGN.md`, all past phase-1's original non-goals). Now in the engine:
  - **Throws / command grabs** — `throw.ts` `Throw` controller + `ThrowDef`, bind/release, resolved before strikes.
  - **Guard / blocking** — automatic block in `hitDef.ts` (high/low/mid/air via `guardFlag`), chip damage, blockstun, real `moveHit`/`moveGuarded` flags for hit-confirm/on-block cancels. Jump attacks are overheads (break crouch guard).
  - **Charge & held-direction motions** (`commands.ts`: `[dir]N`, `/dir`), **power meter** (`PowerAdd`/`PowerSet`, `MAX_POWER`), **opponent triggers** (`p2BodyDist`, `p2Dist`, `p2.pos.y`, `p2.life`, `p2.stateNo`).
  - **Dizzy/stun meter**, **launch → knockdown → getup** flow, **OTG**, and distinct end states (KO lies down / time-up loser slumps / winner poses).
  - **Canonical action vocabulary** (`render/poses.ts` `CANONICAL_ACTIONS`) — the shared ~36-action set every character maps onto; procedural colour-coded poses render any character with no art. `base` declares an animation for every canonical id (the art/authoring template). An **action gallery** (`mountGallery`) cycles a fighter through all of them.
  - **Demo/sandbox character**: a wooden artist-mannequin fighter (original art) on a ~26-action moveset, plus the procedural stick-figure `base`. **CPU P2** opponent in the input layer (`runtime/ai.ts`, 5 difficulty levels standstill→expert) — never touches `tick`.
  - Render-side: follow-camera, parallax stage backgrounds, 30s round timer (win-by-life), unlimited/showcase mode for creator playtest.
  - **M8 determinism stays green; 294 tests pass.** All additions live outside `tick` or are additive/deterministic.
  - Deferred (next gameplay pass): throw teching/air throws, guard meter/parries/pushblock, de-hardcoding `'stand'`/`'ko'`/`'hit.*'`/`'guard.*'` transition literals.
- **Phase 2: mid-build** (AI character creator). Template pipeline: pick a template → nano-banana-2 re-skins a green-screen template sheet → content-aware slice/key/despill/bake → atlas → engine. See `src/creator/`.
- **Phase 3: future** (rollback netcode, online play). Engine architecture is still prepared via the 4 commitments above.
