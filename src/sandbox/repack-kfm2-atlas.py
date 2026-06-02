#!/usr/bin/env python3
"""
Repack the kfm2 atlas into a seamless grid.

Drops two degenerate "junk" frames that the offline baker over-counted
(intro-7 = 34x5px, hitair-11 = 73x7px -- thin slivers, not real poses), then
re-lays the remaining 233 frames row-major into the same 16-col / 123x139 grid
with no mid-sheet holes. Rewrites kfm2-atlas.png + kfm2-data.json in place.

Safe for kfm2.ts: the dropped frames are each the LAST frame of their anim, so
every in-anim slice index it relies on (hitair[5], hitair[6:10], ...) is
preserved, and `intro` is not referenced by any state. Frame w/h/pixels are
copied verbatim -- only each frame's atlas (x,y) changes, so rendering is
byte-identical per frame.

Run:  python3 src/sandbox/repack-kfm2-atlas.py
"""
import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS = os.path.join(HERE, "kfm2-atlas.png")
DATA = os.path.join(HERE, "kfm2-data.json")

DROP = {"intro-7", "hitair-11"}
COLS = 16


def main() -> None:
    data = json.load(open(DATA))
    cw, ch = data["cell"]["w"], data["cell"]["h"]
    old_frames = data["frames"]
    old_atlas = Image.open(ATLAS).convert("RGBA")

    # Global sheet order = current row-major layout (sort by old y then x).
    ordered = sorted(
        (k for k in old_frames if k not in DROP),
        key=lambda k: (old_frames[k]["y"], old_frames[k]["x"]),
    )
    rows = (len(ordered) + COLS - 1) // COLS

    new_atlas = Image.new("RGBA", (COLS * cw, rows * ch), (0, 0, 0, 0))
    new_frames = {}
    for idx, key in enumerate(ordered):
        f = old_frames[key]
        col, row = idx % COLS, idx // COLS
        nx, ny = col * cw, row * ch
        # Copy the frame's exact pixel block (top-left of its old cell) to the
        # new cell's top-left.
        block = old_atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
        new_atlas.paste(block, (nx, ny))
        new_frames[key] = {"x": nx, "y": ny, "w": f["w"], "h": f["h"]}

    new_anims = {
        name: [k for k in keys if k not in DROP]
        for name, keys in data["anims"].items()
    }

    new_atlas.save(ATLAS)
    json.dump(
        {"cell": data["cell"], "frames": new_frames, "anims": new_anims},
        open(DATA, "w"),
    )

    empties = COLS * rows - len(ordered)
    print(f"dropped: {sorted(DROP)}")
    print(f"repacked {len(ordered)} frames -> {COLS}x{rows} grid "
          f"({new_atlas.width}x{new_atlas.height}), {empties} trailing empty cell(s)")


if __name__ == "__main__":
    main()
