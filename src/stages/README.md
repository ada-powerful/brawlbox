# Stages

Stage backgrounds drawn behind the fighters. **Render-only** — a stage never
enters `World` and has zero effect on the deterministic sim (M8 stays green).
The renderer lives in `src/render/background.ts` (`Background` class); a stage is
a `StageArt`: a back-to-front stack of parallax `layers` + an optional `floorUrl`.

## Layout (pinned to the engine's fixed geometry)

The engine stage is a fixed `960 × 540` with the ground contact line at screen
`y = 460` (`GROUND_Y_SCREEN`). Art splits into layers above that line + a floor
below it, so any image — sliced or generated — drops in without re-tuning:

```
 (0,0)            960×460  LAYERS (back-to-front)
 ┌──────────────────────────────────────┐
 │  FAR scenery  (parallax < 1)          │  ← e.g. mountains, sky. Drifts slowly
 │    seen through the near layer's       │     as the camera pans → depth.
 │    transparent openings                │
 │  NEAR wall    (parallax 1)             │  ← e.g. dojo back wall at the fighting
 │    window / slats cut to transparent   │     plane; openings reveal the far layer.
 │  ……………………………………… horizon …………………… │  ← compose so the horizon is at the bottom
 ├────────────────────────────────────────┤ y = 460  GROUND LINE (feet, pos.y=0)
 │  960×80  FLOOR  (wooden platform)       │  ← top edge = where feet rest
 └────────────────────────────────────────┘ y = 540
```

- **layers** — each `960 × 460`, ordered **back-to-front**. Each has a `parallax`
  factor: `1` (default) = moves with the fighting plane; `< 1` = far, drifts
  slower as the camera pans (`0` = pinned on screen). Near layers use
  **transparency** (alpha) so far layers show through their openings.
- **floorUrl** — the floor plane below the junction. Its **top** edge is the
  floor's far edge (where it meets the wall). Optional. Must be **edge-to-edge
  art with no matte** — any background colour baked into the corners shows at the
  stage edges when zoomed out (a perspective trapezoid leaves matte triangles;
  fill them with the surface texture).
- **groundY** — screen-y of the wall↔floor junction (the floor's far edge).
  Defaults to `460`, the feet line — which puts feet on the floor's _back_ edge.
  Set it **above 460** (e.g. `400`) so the floor recedes _behind_ the fighters
  and they stand **mid-floor**, with floor visible both behind and in front of
  them. Render-only; the sim's feet line stays at `GROUND_Y_SCREEN`.
- **backColor** — optional solid colour painted behind every layer. Insurance so
  a thin seam or parallax over-drift at the stage edge never flashes the app
  background; set it to the layers' dominant tone.

**Every layer must be opaque edge-to-edge** (except the deliberate transparent
openings in a near layer). The follow-camera zooms up to 1.9× and pans to the
stage edges, so any **matte / background colour** baked into a layer flashes a
"穿帮" gap there. Opaque decoration at the edges is fine and welcome — the
reference wall keeps its stone side-pillars; what matters is that no see-through
matte reaches an edge. The reference floor is cropped to its solid-wood core (the
rip's perspective trapezoid tapered to matte in the corners) so it fills with
real planks to both edges instead of smeared/blue ones.

Fighters are bounded to world x ∈ `[40, 920]`; the follow-camera zooms `1.0–1.9×`
and pans within the 960-wide stage. Far layers are over-scanned 1.3× so parallax
drift never exposes an edge through a near opening. Keep focal detail roughly
centered and out of the outer ~40px margins. Layers cover-fit (fill + crop), so
exact dims are forgiving, but authoring at `960×460` / `960×80` avoids cropping.

## The `hillside` reference stage (sliced from a MUGEN rip)

```ts
layers: [
  { url: sceneryUrl, parallax: 0.35 },  // FAR: mountains + sky, behind the window
  { url: wallUrl,    parallax: 1 },     // NEAR: dojo wall, window + slats transparent
],
floorUrl,                                // wooden platform
```

The wall's blue MUGEN matte `rgb(128,192,255)` (the window glass + the gaps
between the top slats) was alpha-cut to transparent so the mountains show through.

## Nano Banana 2 generation spec

Generate, per stage, to the layout above:

1. **Far scenery, 960×460.** The view seen through the wall — horizon along the
   _bottom_, no characters/UI/foreground. e.g. _"distant mountain hillside under a
   hazy sky, horizon at the very bottom, painterly, no characters"_.
2. **Near wall, 960×460, transparent PNG.** The back wall at the fighting plane
   with a **transparent** window opening (and any latticework / slats) so the far
   layer shows through. e.g. _"traditional dojo wooden back wall with a large
   central window opening (transparent) and a row of transom slats, stone corner
   pillars, front-on, alpha background"_.
3. **Floor.** Shallow-angle platform surface, far edge at top, seamless
   left-to-right, **filling the full frame edge-to-edge (no matte/border)**. e.g.
   _"weathered wooden dojo floor planks, shallow perspective, seamless, fills the
   whole frame"_. Sized to `960 × (540 − groundY)` — `960 × 140` at `groundY 400`.

(A pure-outdoor stage can skip the wall: a single `parallax: 1` scenery layer +
floor. Use multiple far layers — e.g. clouds 0.1, hills 0.4 — for more depth.)

Then add a folder mirroring `hillside/`:

```ts
// src/stages/<id>/index.ts
import type { StageArt } from '../../render/background.ts';
import sceneryUrl from './scenery.png';
import wallUrl from './wall.png';
import floorUrl from './floor.png';
export const myStage: StageArt = {
  id: '<id>',
  name: '<Name>',
  layers: [{ url: sceneryUrl, parallax: 0.35 }, { url: wallUrl }],
  floorUrl,
};
```

and pass it as `mountGame(mount, { p1, p2, stage: myStage })`. Generated stages can
equally resolve the layer URLs to Blob URLs (same path as generated character
atlases) instead of bundled imports.

## Stages

- **hillside** — `Hillside Dojo`. Indoor dojo with a mountain panorama beyond the
  window. The reference layout the generation spec above is modeled on.
