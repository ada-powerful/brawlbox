#!/usr/bin/env python3
"""
Export the 36-action KFM (kfm2) sprite atlas as a single ~4K labeled
*generation template*.

The kfm2 atlas is already a fixed 16-col x 15-row grid (cell 123x139). This
script upscales that grid to ~4K (width pinned to 3840, aspect preserved) and
overlays only per-frame boundary lines (one box per cell) with the KFM
reference pose drawn in each used cell. No text is burned into the image -- the
code->cell mapping lives entirely in the companion kfm2-template.json so labels
never occlude the art.

The whole point is reuse WITHOUT remapping: the cell layout is identical to
kfm2-data.json, so when a new character is drawn into these same boxed cells the
existing kfm2.ts state machine + frame mapping apply directly. To slice a
regenerated sheet back into a native-resolution atlas, divide every template
pixel coord by `scale` in the companion kfm2-template.json -- no frame
re-detection needed.

Run:  python3 src/sandbox/export-kfm2-template.py
"""
import json
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS = os.path.join(HERE, "kfm2-atlas.png")
DATA = os.path.join(HERE, "kfm2-data.json")
OUT_PNG = os.path.join(HERE, "kfm2-template-4k.png")
OUT_JSON = os.path.join(HERE, "kfm2-template.json")

# ~4K: pin the width to the canonical 4K width, preserve the grid's aspect.
TARGET_W = 3840

# Green-screen background + magenta cell grid. The template's ONLY purpose is to
# feed NB2 (nano-banana-2) as the layout reference for a re-skin. A flat
# chroma-green backdrop both (a) helps the image model separate each pose from the
# background and (b) lets the slicer key it out by auto-sampling it. The magenta
# grid lines give NB2 explicit cell borders so it keeps every pose boxed in its
# cell (without them NB2 drifts poses across boundaries → the slicer cuts slivers).
# Both colors are chroma-keyed out by the frontend, so the FINAL sprites carry no
# background and no border — green and magenta never appear on the character.
# (Green/magenta is the classic keyable pair; both are rare in real characters.)
BG = (0, 255, 0, 255)
DRAW_GRID = True
GRID = (255, 0, 255, 255)
GRID_EDGE = (255, 0, 255, 255)
GRID_WIDTH = 6


def main() -> None:
    data = json.load(open(DATA))
    cell = data["cell"]
    cw, ch = cell["w"], cell["h"]
    frames = data["frames"]

    src = Image.open(ATLAS).convert("RGBA")
    cols = round(src.width / cw)
    rows = round(src.height / ch)

    scale = TARGET_W / src.width
    out_w = TARGET_W
    out_h = round(src.height * scale)
    # Per-cell size in the scaled template (kept as floats; rounded at draw time).
    tcw = out_w / cols
    tch = out_h / rows

    # 1) Upscale the sprite layer and composite onto the neutral background.
    sprites = src.resize((out_w, out_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (out_w, out_h), BG)
    canvas.alpha_composite(sprites)

    draw = ImageDraw.Draw(canvas)

    # 2) Magenta cell grid — keyable borders that keep NB2's poses boxed.
    if DRAW_GRID:
        for c in range(cols + 1):
            x = round(c * tcw)
            draw.line([(x, 0), (x, out_h)], fill=GRID_EDGE if c in (0, cols) else GRID, width=GRID_WIDTH)
        for r in range(rows + 1):
            y = round(r * tch)
            draw.line([(0, y), (out_w, y)], fill=GRID_EDGE if r in (0, rows) else GRID, width=GRID_WIDTH)

    # 3) Build the code->cell map for the companion JSON. No text is drawn on
    #    the image -- the per-frame boundary boxes (the grid above) are the only
    #    overlay, so nothing occludes the art. The mapping lives here instead.
    cell_map = {}  # "col,row" -> frame key
    for key, f in frames.items():
        col = round(f["x"] / cw)
        row = round(f["y"] / ch)
        cell_map[f"{col},{row}"] = key

    canvas.convert("RGB").save(OUT_PNG)

    spec = {
        "source": "kfm2-atlas.png",
        "note": (
            "4K generation template for the 36-action KFM grid. Draw a new "
            "character into the same labeled cells, then slice the result with "
            "this spec (divide template px by `scale`) to reuse kfm2-data.json "
            "and kfm2.ts unchanged -- no frame remapping required."
        ),
        "image": "kfm2-template-4k.png",
        "templateSize": {"w": out_w, "h": out_h},
        "grid": {"cols": cols, "rows": rows},
        "nativeCell": {"w": cw, "h": ch},
        "templateCell": {"w": tcw, "h": tch},
        "scale": scale,
        "anims": data["anims"],
        "cellMap": cell_map,
    }
    json.dump(spec, open(OUT_JSON, "w"), indent=2)

    print(f"wrote {OUT_PNG}  ({out_w}x{out_h}, scale x{scale:.4f})")
    print(f"wrote {OUT_JSON}  ({len(cell_map)} labeled cells, {cols}x{rows} grid)")


if __name__ == "__main__":
    main()
