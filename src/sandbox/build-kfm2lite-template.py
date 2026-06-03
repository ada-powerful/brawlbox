#!/usr/bin/env python3
"""
Build the *reduced* "kfm2lite" template from the full kfm2 atlas.

Why this exists: the full kfm2 sheet packs 233 poses into a tight 16x15 grid
with NO inter-cell padding, so (a) wide poses nearly touch their neighbors and
the green-gap slicer bleeds an adjacent/overhead pose into a frame, and (b) each
pose is tiny in the 4K template, so NB2 (nano-banana-2) renders blurry faces.

kfm2lite fixes both by trimming the moveset and re-packing with breathing room:

  * Drop 10 redundant anim rows (run, spin, jumplk, crouchhook, hook, punch2h,
    uppercut, hk, crouchhk, dashkick) -> 156 frames remain. Merged moves
    (hk->lk, crouchhk->crouchlk, dashkick->walkkick) reuse another row's art in
    kfm2lite.ts, so their rows aren't needed on the sheet.
  * Re-pack into a PADDED grid: each pose is centered in a cell that is larger
    than the widest/tallest kept pose, leaving a guaranteed green margin on every
    side (room for FX overflow + clean slicing). Fewer columns => each pose is
    drawn bigger in the 4K template => more detail for NB2.

Outputs (all in this dir), mirroring the kfm2 asset set:
  kfm2lite-atlas.png        transparent-bg engine atlas (padded grid, centered)
  kfm2lite-data.json        { cell, frames{key->{x,y,w,h}}, anims }
  kfm2lite-template-4k.png  flat-green 4K template (upload to S3 templates/kfm2lite.png)
  kfm2lite-template.json    { grid, nativeCell, templateCell, scale, anims, cellMap }

The engine renders from the tight per-frame rect, so where a pose sits inside its
padded cell is irrelevant to gameplay -- the padding only shapes the green gaps
the template/slicer see.

Run:  python3 src/sandbox/build-kfm2lite-template.py
"""
import json
import math
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_ATLAS = os.path.join(HERE, "kfm2-atlas.png")
SRC_DATA = os.path.join(HERE, "kfm2-data.json")

OUT_ATLAS = os.path.join(HERE, "kfm2lite-atlas.png")
OUT_DATA = os.path.join(HERE, "kfm2lite-data.json")
OUT_TPL_PNG = os.path.join(HERE, "kfm2lite-template-4k.png")
OUT_TPL_JSON = os.path.join(HERE, "kfm2lite-template.json")

# Anim rows removed from the lite sheet (cut outright, or merged onto another
# row's art by kfm2lite.ts so their own frames are unused).
CUT = {
    "run", "spin", "jumplk", "crouchhook", "hook",
    "punch2h", "uppercut", "hk", "crouchhk", "dashkick",
}

# Layout knobs. Fewer columns => bigger pose in the 4K template. Pad factors set
# the green margin around the widest/tallest kept pose.
COLS = 12
PAD_X = 1.45  # cell width  = widest kept pose * PAD_X  (>=~28px/side margin)
PAD_Y = 1.20  # cell height = tallest kept pose * PAD_Y
BOTTOM_MARGIN = 10  # px of green under the feet; the rest is top headroom for FX
TARGET_W = 3840  # 4K template width (aspect preserved)
BG = (0, 255, 0, 255)  # flat chroma-green field (no grid lines; slicer uses gaps)


def main() -> None:
    data = json.load(open(SRC_DATA))
    src_frames = data["frames"]
    atlas = Image.open(SRC_ATLAS).convert("RGBA")

    # Kept frames, grouped by anim in the original row order (readable cellMap +
    # sensible gallery order). Skip cut anims entirely.
    ordered: list[str] = []
    kept_anims: dict[str, list[str]] = {}
    for name, keys in data["anims"].items():
        if name in CUT:
            continue
        live = [k for k in keys if k in src_frames]
        kept_anims[name] = live
        ordered.extend(live)

    max_w = max(src_frames[k]["w"] for k in ordered)
    max_h = max(src_frames[k]["h"] for k in ordered)
    cw = math.ceil(max_w * PAD_X)
    ch = math.ceil(max_h * PAD_Y)
    rows = math.ceil(len(ordered) / COLS)

    # 1) Re-pack into the padded grid: center horizontally, bottom-align feet.
    new_atlas = Image.new("RGBA", (COLS * cw, rows * ch), (0, 0, 0, 0))
    new_frames: dict[str, dict] = {}
    cell_map: dict[str, str] = {}
    for idx, key in enumerate(ordered):
        f = src_frames[key]
        col, row = idx % COLS, idx // COLS
        nx = col * cw + (cw - f["w"]) // 2
        ny = row * ch + (ch - f["h"] - BOTTOM_MARGIN)
        block = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
        new_atlas.paste(block, (nx, ny))
        new_frames[key] = {"x": nx, "y": ny, "w": f["w"], "h": f["h"]}
        cell_map[f"{col},{row}"] = key

    new_atlas.save(OUT_ATLAS)
    json.dump(
        {"cell": {"w": cw, "h": ch}, "frames": new_frames, "anims": kept_anims},
        open(OUT_DATA, "w"),
        indent=2,
    )

    # 2) Green 4K template: upscale the padded atlas, composite onto green.
    scale = TARGET_W / new_atlas.width
    out_w = TARGET_W
    out_h = round(new_atlas.height * scale)
    sprites = new_atlas.resize((out_w, out_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (out_w, out_h), BG)
    canvas.alpha_composite(sprites)
    canvas.convert("RGB").save(OUT_TPL_PNG)

    tcw = out_w / COLS
    tch = out_h / rows
    spec = {
        "source": "kfm2-atlas.png (reduced + padded)",
        "note": (
            "Reduced 26-action KFM template, re-packed with inter-cell padding "
            "for clean green-gap slicing + better NB2 fidelity. Draw a new "
            "character into the same cells; slice with this grid (divide template "
            "px by `scale`) to reuse kfm2lite-data.json + kfm2lite.ts unchanged."
        ),
        "image": "kfm2lite-template-4k.png",
        "templateSize": {"w": out_w, "h": out_h},
        "grid": {"cols": COLS, "rows": rows},
        "nativeCell": {"w": cw, "h": ch},
        "templateCell": {"w": tcw, "h": tch},
        "scale": scale,
        "anims": kept_anims,
        "cellMap": cell_map,
    }
    json.dump(spec, open(OUT_TPL_JSON, "w"), indent=2)

    empties = COLS * rows - len(ordered)
    print(f"kept {len(kept_anims)} anims, {len(ordered)} frames")
    print(f"padded cell {cw}x{ch} (from max content {max_w}x{max_h})")
    print(f"wrote {OUT_ATLAS}  ({new_atlas.width}x{new_atlas.height}, {COLS}x{rows} grid, {empties} empty)")
    print(f"wrote {OUT_TPL_PNG}  ({out_w}x{out_h}, scale x{scale:.4f}, cell {tcw:.0f}x{tch:.0f})")
    print(f"wrote {OUT_DATA}, {OUT_TPL_JSON}")


if __name__ == "__main__":
    main()
