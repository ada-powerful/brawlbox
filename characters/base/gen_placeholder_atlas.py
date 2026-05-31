#!/usr/bin/env python3
"""Generate a placeholder sprite atlas for the `base` character (M2.0).

Draws one white stick-figure silhouette per referenced sprite key on a
transparent background, laid out in a fixed grid. The engine tints each
frame per-player at render time, so frames are drawn in white.

Run:  python3 characters/base/gen_placeholder_atlas.py
Emits: characters/base/atlas.png  and prints the spriteAtlas.frames JSON.
"""
import json
import os
from PIL import Image, ImageDraw

CELL_W, CELL_H = 80, 120
COLS = 4
LINE = 4
FOOT = CELL_H - 4  # feet baseline inside a cell

# (col, row) -> sprite key. Order defines layout, not draw logic.
KEYS = [
    "stand", "walk-0", "walk-1", "jump-rise",
    "jump-fall", "punch-startup", "punch-active", "punch-recovery",
    "hit-stand", "hit-air", "ko",
]


def figure(d, ox, oy, key):
    """Draw one pose. (ox,oy) = cell top-left. White RGBA, feet at FOOT."""
    w = "white"

    def head(cx, cy, r=10):
        d.ellipse([ox + cx - r, oy + cy - r, ox + cx + r, oy + cy + r], outline=w, width=LINE)

    def line(x1, y1, x2, y2):
        d.line([ox + x1, oy + y1, ox + x2, oy + y2], fill=w, width=LINE)

    if key == "stand":
        head(40, 18); line(40, 28, 40, 70)
        line(40, 40, 22, 58); line(40, 40, 58, 58)
        line(40, 70, 30, FOOT); line(40, 70, 50, FOOT)
    elif key == "walk-0":
        head(40, 18); line(40, 28, 40, 70)
        line(40, 42, 24, 56); line(40, 42, 56, 56)
        line(40, 70, 22, FOOT); line(40, 70, 54, FOOT - 8)
    elif key == "walk-1":
        head(40, 18); line(40, 28, 40, 70)
        line(40, 42, 56, 56); line(40, 42, 24, 56)
        line(40, 70, 58, FOOT); line(40, 70, 26, FOOT - 8)
    elif key == "jump-rise":
        head(40, 24); line(40, 34, 40, 66)
        line(40, 44, 24, 26); line(40, 44, 56, 26)
        line(40, 66, 30, 100); line(40, 66, 50, 100)
    elif key == "jump-fall":
        head(40, 22); line(40, 32, 40, 64)
        line(40, 42, 20, 30); line(40, 42, 60, 30)
        line(40, 64, 22, 104); line(40, 64, 58, 104)
    elif key == "punch-startup":
        head(40, 18); line(40, 28, 40, 70)
        line(40, 40, 56, 34); line(40, 40, 26, 50)  # right arm cocked back
        line(40, 70, 30, FOOT); line(40, 70, 50, FOOT)
    elif key == "punch-active":
        head(40, 18); line(40, 28, 40, 70)
        line(40, 40, 76, 40); line(40, 40, 24, 52)  # right arm fully extended
        line(40, 70, 28, FOOT); line(40, 70, 52, FOOT)
    elif key == "punch-recovery":
        head(40, 18); line(40, 28, 40, 70)
        line(40, 40, 62, 46); line(40, 40, 26, 52)
        line(40, 70, 30, FOOT); line(40, 70, 50, FOOT)
    elif key == "hit-stand":
        head(30, 22); line(30, 32, 44, 72)  # leaning back
        line(34, 44, 18, 36); line(34, 44, 50, 40)
        line(44, 72, 34, FOOT); line(44, 72, 56, FOOT)
    elif key == "hit-air":
        head(22, 40); line(30, 42, 64, 56)  # near-horizontal
        line(40, 46, 36, 28); line(40, 46, 48, 30)
        line(64, 56, 70, 40); line(64, 56, 72, 70)
    elif key == "ko":
        head(20, FOOT - 12); line(28, FOOT - 8, 70, FOOT - 4)  # lying down
        line(46, FOOT - 6, 40, FOOT - 22); line(58, FOOT - 5, 64, FOOT - 20)


def main():
    rows = (len(KEYS) + COLS - 1) // COLS
    img = Image.new("RGBA", (COLS * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    frames = {}
    for i, key in enumerate(KEYS):
        col, row = i % COLS, i // COLS
        ox, oy = col * CELL_W, row * CELL_H
        figure(d, ox, oy, key)
        frames[key] = {"x": ox, "y": oy, "w": CELL_W, "h": CELL_H}

    out = os.path.join(os.path.dirname(__file__), "atlas.png")
    img.save(out)
    print("wrote", out, img.size)
    print(json.dumps(frames, indent=2))


if __name__ == "__main__":
    main()
