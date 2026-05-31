# ftg — Phase 2 Plan

The AI-assisted character creator. Phase 1 proved the engine model (pure 60Hz `tick`, single `World`, JSON-native `Character`, determinism harness green). Phase 2 builds the creator on top of that known-good substrate: **text description → AI-generated, playable, exportable character — entirely in the browser.**

> **Scoped:** 2026-04-25. Mirrors `PHASE_1_PLAN.md`. Decisions in §10.

## 1. Goal — the done bar

**A user opens the app, pastes an API key, types "a stone golem brawler with a slow heavy uppercut," and a few minutes later is playing a hand-drawn-looking character against the stick figure — then exports it as a `.ftg` bundle and re-imports it on another machine.**

Concrete acceptance test: from a fresh browser profile, the flow `text prompt → valid Character JSON → generated sprite atlas → loads into the existing engine → survives a KO round → exports to `.ftg` → re-imports → renders identically` completes without a manual JSON edit. The engine path is unchanged: an AI character is just a `Character` that `parseCharacter()` accepts.

## 2. Non-goals (deferred to phase 3+)

- **Netcode / online play.** Still phase 3. The 4 commitments stay honored so it remains a drop-in.
- **Server-side anything for the MVP.** BYOK, browser-direct API calls. No proxy, no account system, no hosted character gallery (revisited phase 3+ when cross-user sharing matters).
- **Training LoRAs / ControlNet rigs.** gpt-image-2 zero-shot with a reference image only (confirmed sufficient for cross-frame consistency).
- **Sound generation.** Phase 2 reuses phase-1 sound hooks; AI sound is later.
- **Multi-character batch generation, roster management UI.** One character at a time.
- **Rebalancing / matchmaking / difficulty AI.** The generated character's `data` (life/attack/etc.) is LLM-proposed and user-editable, not auto-tuned.
- **Mobile / touch UI.** Desktop browser only for MVP.

## 3. Architectural commitments

### 3a. Carried over from Phase 1 (still load-bearing)

The four phase-1 commitments are unchanged and **must not regress** — they are the precondition for phase-3 rollback:

1. Pure `tick(world, characters, inputs) → World` — no `Math.random`/`Date.now`/DOM in tick.
2. Single `World` struct; `structuredClone` round-trips identically (M8 test enforces).
3. Stable iteration via `Player[]` indices; no `Map`/`Set` in serialized state.
4. Fixed 60Hz sim, decoupled render via accumulator + interpolation alpha.

**The M8 determinism test must stay green through all of phase 2.** Any creator/editor/AI code lives *outside* `engine/` and never reaches into `tick`.

### 3b. New for the creator (Phase 2 specific)

5. **The engine has no AI awareness.** All LLM/image-gen/editor code lives in `src/creator/` (React) and `src/ai/` (provider calls). `engine/` gains nothing AI-related. An AI character and a hand-authored one take the identical `parseCharacter → tick → render` path.
6. **Validation is the correctness gate, not a vibe check.** Every LLM-emitted character goes through `parseCharacter()`. Zod errors are fed back into the generation prompt for a bounded retry loop (see M2.1). We never accept un-parsed JSON into the engine.
7. **BYOK key never leaves the browser except to the model provider.** Stored in memory (and optionally `localStorage` opt-in), sent only to `api.openai.com` / `api.anthropic.com`. No telemetry, no proxy.
8. **Generated assets are content-addressable and offline-replayable.** Atlas PNGs + JSON + character JSON persist in IndexedDB keyed by character id. A generated character must reload from IndexedDB with zero network calls.

## 4. Tech stack (Phase 2 additions)

| Concern | Choice | Why |
|---|---|---|
| Creator UI | **React + Vite** | Editor surface (frame grid, hitbox drag, JSON view) justifies a framework. Same Vite build as engine. |
| Styling | **Tailwind + shadcn/ui** | Fast, consistent component layer; ~80KB accepted. |
| LLM config gen | **BYOK: OpenAI or Anthropic**, browser-direct | No server. User pastes key. |
| Image gen | **gpt-image-2 zero-shot** + reference image | User-confirmed cross-frame consistency without rigs. |
| Atlas packing | **In-browser canvas packer** → single PNG + JSON-array (Aseprite-shaped) | Matches phase-1 `spriteAtlas` schema; no native tooling. |
| Local persistence | **IndexedDB** (via `idb`) | Blobs (PNG) + JSON, content-addressed by character id. |
| Bundle format | **`.ftg` = zip** (`fflate`) | `character.json` + `atlas.png` + `atlas.json` + `manifest.json` (+ sounds later). |
| Sprite background removal | **Alpha threshold on canvas** | Auto-derive body hurtbox = bounding box of non-transparent pixels. |

Carried from phase 1, unchanged: TypeScript strict, PixiJS `~8.6.0`, Zod, Vitest, bun.

## 5. Data model — what Phase 2 adds

The `Character` schema already anticipates this: `spriteAtlas: { url, frames: Record<string, FrameRect> }` is **already defined and optional** in `engine/schema.ts`. Phase 1 left it unused (procedural `Graphics` shapes per `animId`). Phase 2 populates it.

New non-engine schemas (live in `src/creator/` or `src/ai/`, NOT `engine/schema.ts` unless the engine reads them):

```ts
// AI generation request the LLM fills out — a thin spec over the Character schema.
type GenSpec = {
  prompt: string;                 // user's free text
  style?: string;                 // 'pixel' | 'inked' | 'painted' ...
  referenceImageDataUrl?: string; // optional anchor for consistency
};

// Bundle manifest written into the .ftg zip.
type FtgManifest = {
  formatVersion: 1;
  characterId: string;
  name: string;
  createdAt: string;              // ISO; stamped OUTSIDE the engine (no Date.now in tick)
  engineVersion: string;
  files: { character: string; atlas: string; atlasMeta: string; sounds?: string[] };
};
```

The engine-facing addition is **only** that `spriteAtlas.frames` now gets real rects and `AnimFrame.sprite` keys resolve into them. No new fields in `tick`'s path.

## 6. Folder structure (additions)

```
src/
  engine/        # UNCHANGED. No AI imports ever.
  render/
    fighter.ts   # M2.0: swap procedural Graphics → atlas-backed Sprite
  runtime/
    assets.ts    # M2.0: load atlas PNG + JSON, build Pixi Textures (currently absent)
  ai/            # NEW — provider calls, BYOK key handling
    llm.ts       # text → Character JSON w/ Zod-retry loop
    image.ts     # gpt-image-2 per-frame generation
    keystore.ts  # in-memory + opt-in localStorage key
  creator/       # NEW — React editor app
    App.tsx
    components/  # frame grid, hitbox editor, JSON view, key entry
    store/       # IndexedDB persistence (idb)
    bundle.ts    # .ftg export/import (fflate)
characters/
  base/character.json   # existing stick figure (the sparring partner)
test/
  assets.test.ts        # atlas frame-rect resolution, missing-sprite handling
  bundle.test.ts        # .ftg round-trip (export → import → deep-equal)
  llm-retry.test.ts     # Zod-error → prompt-feedback loop (mocked provider)
```

> Note: phase-1 plan listed `merge.ts`/`fx.ts` and a `stick/` character; actual repo shipped a single `characters/base/character.json` and procedural rendering. Phase 2 builds on the **actual** state.

## 7. Milestones

Each ends with a green test or a visible demo. ~16 working days total.

**M2.0 — Real PNG atlas loading (~2 days)**
Add `src/runtime/assets.ts`: fetch `spriteAtlas.url`, build a Pixi `Texture` + per-frame `Texture` sub-rects from `spriteAtlas.frames`. Rewrite `src/render/fighter.ts` to swap a `Sprite`'s texture per `(animId → AnimFrame.sprite)` instead of drawing procedural polys. Fall back to the existing procedural shape when a character has no `spriteAtlas` (keeps the stick figure working). Author one real atlas for `characters/base` (or a generated placeholder) so the demo shows a drawn fighter. **Tests: `assets.test.ts` — frame-rect → sub-texture math, missing-sprite key throws at load not at tick. Demo: a hand-drawn character renders and animates; M8 still green.**

**M2.1 — App shell + BYOK + LLM JSON gen (~3 days)**
React app shell (Tailwind + shadcn). API-key entry (`ai/keystore.ts`). `ai/llm.ts`: prompt → `Character` JSON, run through `parseCharacter()`, on Zod failure feed the formatted error back into the system prompt and retry (bounded, e.g. 3 attempts). **Tests: `llm-retry.test.ts` with a mocked provider that returns one bad then one good JSON → loop converges. Demo: type a prompt → valid Character JSON appears, parses clean.**

**M2.2 — Image-gen pipeline + IndexedDB (~5 days)**
`ai/image.ts`: per-frame gpt-image-2 generation with the reference-image anchor. In-browser atlas packer → single PNG + Aseprite-shaped JSON. Auto-derive body hurtbox via alpha-bounding-box. Persist character JSON + atlas blob to IndexedDB (commitment 8: reload offline). Wire into M2.0's loader. **Demo: text prompt → fully generated, playable character vs. the stick figure; reload page → character still there, no network.**

**M2.3 — Frame review UI (~3 days)**
Grid of generated frames; per-frame regenerate; reorder/duration tweak. Live preview in an isolated playtest canvas. **Demo: regenerate a single bad frame without touching the rest.**

**M2.4 — `.ftg` bundle export/import + minimal hitbox editor (~3 days)**
`creator/bundle.ts`: zip (`fflate`) export of `character.json` + `atlas.png` + `atlas.json` + `manifest.json`; import reverses it and re-validates via `parseCharacter()`. Minimal drag-to-fix hitbox editor for outlier frames the auto-derive got wrong. **Tests: `bundle.test.ts` round-trip deep-equal. Demo: export → re-import on a clean profile → identical character. Creator is shippable.**

Total: ~16 working days, ~3 weeks calendar.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM emits structurally-valid but unplayable characters (broken state graph, no win condition) | `parseCharacter` already checks `ChangeState`/`ChangeAnim`/command refs resolve. Add a smoke-sim: run N ticks of scripted input, assert no throw + reachable `ko`. |
| Cross-frame sprite drift despite reference image | User pre-confirmed zero-shot works; M2.3 per-frame regenerate is the escape hatch. Pin model + seed where the API allows. |
| BYOK key leakage | Commitment 7: memory-only by default, explicit opt-in for `localStorage`, calls only to provider origin. No third-party scripts on the editor page. |
| Auto-derived hurtboxes wrong on transparent-heavy frames | Alpha-threshold bounding box + M2.4 manual fix editor. Log frames where the box is suspiciously small/large. |
| React/editor code creeping into `engine/` and breaking determinism | Commitment 5 + lint rule: `engine/` may not import from `creator/`, `ai/`, `react`, or `pixi`. M8 test is the backstop. |
| Image-gen cost/latency surprises the user | Show a per-frame cost/credit estimate before generating; generate lazily per animation, not all upfront. |
| `.ftg` format churn | `formatVersion` in the manifest from day one; importer rejects unknown major versions with a clear message. |
| IndexedDB blob size / quota | Store atlas as compressed PNG; surface quota errors; export-to-disk is the durable backup. |

## 9. What this unlocks for Phase 3

- A library of user-generated, validated, deterministic characters — exactly the inventory online play needs.
- BYOK proves the generation pipeline before committing to a hosted proxy + sharing backend.
- The `.ftg` bundle is the natural unit for a future character gallery / matchmaking payload.
- Engine untouched and still rollback-ready: phase 3 is netcode integration (`@tboyt/telegraph` or similar), not an engine rewrite.

## 10. Decisions log

| # | Decision | Choice | Rationale |
|---|---|---|---|
| B1 | Backend posture | **BYOK, browser-direct** | No server for MVP; revisit proxy in phase 3 for sharing |
| B2 | Creator UI framework | **React + Tailwind + shadcn** | Editor surface justifies framework; ~80KB accepted |
| B3 | Hitbox authoring | **Auto-derive (alpha bbox) + minimal manual editor** | Body hurtbox from sprite alpha; attack boxes from LLM per-frame; user fixes outliers |
| B4 | Sprite generation | **gpt-image-2 zero-shot + reference image** | User-confirmed consistency without LoRA/ControlNet |
| B5 | Validation strategy | **`parseCharacter` Zod-retry loop** | Zod errors are good prompt feedback; no un-parsed JSON enters engine |
| B6 | Persistence | **IndexedDB, content-addressed** | Offline reload; export is durable backup |
| B7 | Bundle format | **`.ftg` zip + `formatVersion`** | Portable, versioned, re-validated on import |
| B8 | Engine isolation | **No AI imports in `engine/`; lint-enforced** | Protects the 4 phase-1 commitments / rollback readiness |
