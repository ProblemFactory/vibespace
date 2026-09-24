#!/usr/bin/env python3
"""Judges the mockup PNGs BY PIXELS (never by eyeballing): for every probe
rect shoot.mjs recorded, the crop inside the screenshot must (a) exist and
sit inside the viewport width (no horizontal overflow), and (b) be PAINTED —
its pixels are not one flat colour, and a text-bearing probe carries ink
(a measurable share of pixels differ from the crop's dominant colour).
A missing element, an off-screen element or a flat crop is a FAIL.

    python3 docs/mockups/integrations-per-account/check.py
"""
import json, os, sys
from PIL import Image
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
shots = json.load(open(os.path.join(here, 'shots.json')))
fails = 0; passes = 0

def dominant_share(arr):
    """share of pixels equal to the most common colour (quantised to 8 levels/channel)"""
    q = (arr[:, :, :3] // 32).reshape(-1, 3)
    keys = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
    counts = np.bincount(keys)
    return counts.max() / keys.size

for key, m in shots.items():
    img = np.array(Image.open(os.path.join(here, m['file'])).convert('RGB'))
    H, W = img.shape[:2]
    for p in m['probes']:
        name = f"{key} · {p['name']}"
        if p.get('missing'):
            print(f"  ✗ {name}: element MISSING"); fails += 1; continue
        x, y, w, h = p['x'], p['y'], p['w'], p['h']
        if w <= 0 or h <= 0:
            print(f"  ✗ {name}: zero-size rect"); fails += 1; continue
        if x < 0 or x + w > m['vw'] + 1:
            print(f"  ✗ {name}: outside the viewport width (x={x} w={w} vw={m['vw']})"); fails += 1; continue
        # the visible part of the rect: inside the frame AND inside the scroll container's visible rect
        # (a card below the window's inner scroll is legitimately clipped in the as-rendered frame)
        x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        sc = m.get('innerScroll')
        if sc and not key.endswith('.full') and p['sel'] not in ('#chan-connect-dialog', '#dup-dialog', '#chan-reauth-dialog', '#chan-edit-dialog', '.dialog', '#panel'):
            x0, y0, x1, y1 = max(x0, sc['x']), max(y0, sc['y']), min(x1, sc['x'] + sc['w']), min(y1, sc['y'] + sc['h'])
        if y1 - y0 < 4 or x1 - x0 < 4:
            if key.endswith('.full'):
                print(f"  ✗ {name}: not inside the full frame (y={y} h={h} H={H})"); fails += 1
            else:
                print(f"  · {name}: below the fold of the as-rendered frame (inner scroll) — judged on the .full frame"); passes += 1
            continue
        crop = img[y0:y1, x0:x1]
        share = dominant_share(crop)
        std = float(crop.astype(np.float32).std())
        # a painted control: not one flat colour. Text-bearing probes need INK: ≥ 2 % of pixels off the dominant colour.
        textual = bool(p.get('text'))
        ok = std > 2.0 and (not textual or share < 0.98)
        if ok:
            passes += 1
        else:
            fails += 1
            print(f"  ✗ {name}: looks unpainted (std={std:.1f}, dominant share={share:.3f}, text={p.get('text')!r})")
    print(f"{key}: {len(m['probes'])} probes checked ({W}×{H})")

print(f"\n{'FAIL' if fails else 'ALL PASS'} ({passes} pass, {fails} fail)")
sys.exit(1 if fails else 0)
