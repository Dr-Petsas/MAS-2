"""Analyse: welche Fuellfarben bilden die Zweit-/Palatinalwurzeln in teethSVG."""
import json
import re

cols = json.load(open(r"F:\MAS-2\backend\public\m\lena-01\perio-cols.json"))
svg = open(r"F:\MAS-2\backend\public\m\lena-01\teeth-source.svg", encoding="utf-8").read()
targets = {36, 37, 46, 47, 44, 33}
colmap = {c["fdi"]: c for c in cols["cols"]}
paths = re.findall(r"<path[^>]*>", svg)

# Gradienten-Definitionen ausgeben (14/24-Wurzeln nutzen url(#gradient_N))
for m in re.finditer(r"<linearGradient[^>]*id=\"(gradient_\d+)\"[^>]*>(.*?)</linearGradient>", svg, re.S):
    stops = re.findall(r'stop-color="([^"]+)"', m.group(2))
    print("GRAD", m.group(1), stops)


def bounds(d):
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", d)]
    xs = nums[0::2]
    ys = nums[1::2]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


print("fdi | fill | bbox | Groesse   (nur Wurzelzone Oberkiefer, y0 < 285)")
for p in paths:
    dm = re.search(r'd="([^"]+)"', p)
    fm = re.search(r'fill="([^"]+)"', p)
    if not dm or not fm:
        continue
    b = bounds(dm.group(1))
    if not b:
        continue
    x0, y0, x1, y1 = b
    cx = (x0 + x1) / 2
    for fdi in targets:
        c = colmap.get(fdi)
        if not c or c["upper"]:
            continue
        if cx < c["x0"] or cx > c["x1"]:
            continue
        if y1 < 500:
            continue
        w = x1 - x0
        h = y1 - y0
        if w < 6 or h < 15:
            continue
        print(fdi, fm.group(1), [round(v, 1) for v in b], "w=%.0f h=%.0f" % (w, h))
