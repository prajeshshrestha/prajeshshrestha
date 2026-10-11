#!/usr/bin/env python3
"""Trim the generated "contributions" card down to its streak tiles.

The card renderer always appends a 3D bar chart under the streak tiles. The
README only wants the tiles, so cut everything from the first 3D layer on and
shrink the card height to fit. Safe to run repeatedly.
"""
import re
from pathlib import Path

CARD_HEIGHT = 178  # tiles end at y=154, plus the same 24px padding the card uses elsewhere

for path in Path("assets/stats").glob("contributions.*.svg"):
    svg = path.read_text()
    cut = svg.find('<g class="iso"')
    if cut == -1:
        continue  # already cropped
    svg = svg[:cut] + "</svg>"
    svg = re.sub(r'viewBox="0 0 (\d+) \d+"', rf'viewBox="0 0 \1 {CARD_HEIGHT}"', svg, count=1)
    svg = re.sub(r'(<svg [^>]*?)height="\d+"', rf'\1height="{CARD_HEIGHT}"', svg, count=1)
    svg = re.sub(r'(<rect x="0.5" y="0.5" width="\d+") height="\d+"', rf'\1 height="{CARD_HEIGHT - 1}"', svg, count=1)
    path.write_text(svg)
    print(f"cropped {path}")
