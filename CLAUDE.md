# ftg — browser MUGEN engine

Browser-native 2D fighting game engine with a JSON-native character format. Phase 1 engine is complete; phase 2 (AI-assisted character creator) is the next sprint. See `PHASE_1_PLAN.md` for the full design.

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
  render/    ← Pixi-side, reads World, never mutates it.
  input/     ← keyboard + gamepad polling.
  runtime/   ← rAF loop + accumulator + interpolation.
characters/  ← hand-authored character JSON + atlas (phase 2 lands real assets).
test/        ← Vitest suite, file-per-module.
```

`src/main.ts` wires it all together.

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

## Phase status

- **Phase 1: complete** (engine + state machine + animation + commands + collision + match flow + determinism harness). See `git log` for milestone history.
- **Phase 2: scoped, not started** (AI character creator). Decisions and sub-phase plan stored in user-level memory.
- **Phase 3: future** (rollback netcode, online play). Engine architecture is already prepared via the 4 commitments above.
