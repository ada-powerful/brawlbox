# BrawlBox

Browser-native 2D fighting game with a **deterministic engine** and an **AI-assisted character
creator**. Describe a fighter in plain language and play it in a real fighting-game engine — no
install, runs in the browser.

**Play the hosted version:** https://brawlbox.gg

## Quick start (runs locally, zero backend)

```sh
git clone https://github.com/ada-powerful/brawlbox
cd brawlbox
bun install
bun dev
```

Open **http://localhost:5173/sandbox.html** — the deterministic engine, a demo fighter, and a CPU
opponent run with no setup at all: no cloud, no API keys, no account.

> Uses [Bun](https://bun.sh). `bun test` runs the suite; `bun run typecheck` type-checks.

## Generate your own fighter (BYOK)

The creator can generate a **playable character from a text prompt** using your own OpenAI key. The
key stays in your browser and is sent only to OpenAI — there is no proxy:

1. `bun dev`, then open the creator.
2. Paste your OpenAI API key.
3. Describe a fighter — the engine gets a complete, playable character (moves, stats, behavior).

The richer pipeline — photo → character, AI sprite re-skinning, portraits, and the saved cloud
gallery — is a **hosted feature** at [brawlbox.gg](https://brawlbox.gg).

## What's inside

| Path | What |
| --- | --- |
| `src/engine` | The deterministic core: a pure `tick`, character schema as source of truth. |
| `src/render` | Pixi.js rendering, canonical action vocabulary, procedural poses. |
| `src/runtime` | rAF loop + interpolation + the input-layer CPU opponent. |
| `src/creator` | React creator UI, BYOK AI clients, template pipeline. |
| `src/sandbox` | Backend-free local test harness (`sandbox.html`). |

Built with **Pixi.js · TypeScript · React · Vite · Bun**.

## License

- **Code:** [MIT](LICENSE)
- **Bundled art assets** (the wooden-mannequin demo character, stages): [CC0-1.0](ASSETS.md) — public domain.

The **"BrawlBox" name and logo** are trademarks of the project author and are not covered by the
MIT license.
