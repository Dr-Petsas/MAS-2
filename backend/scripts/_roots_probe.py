# -*- coding: utf-8 -*-
"""Kandidaten-Pfade fuer Zweit-/Palatinalwurzeln in teeth-source.svg auflisten."""
import json
import re

svg = open(r'F:\MAS-2\backend\public\m\lena-01\teeth-source.svg', encoding='utf-8').read()
cols = json.load(open(r'F:\MAS-2\backend\public\m\lena-01\perio-cols.json', encoding='utf-8'))


def bounds(d):
    nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', d)]
    xs = nums[0::2]
    ys = nums[1::2]
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


info = []
for p in re.findall(r'<path[^>]*>', svg):
    dm = re.search(r'\bd="([^"]+)"', p)
    fm = re.search(r'fill="([^"]+)"', p)
    if not dm:
        continue
    b = bounds(dm.group(1))
    if not b:
        continue
    info.append({'fill': fm.group(1) if fm else '', 'b': b})

for fdi in [14, 24, 16, 17, 18, 25, 26, 27]:
    c = next(k for k in cols['cols'] if k['fdi'] == fdi)
    print('=== Zahn', fdi, 'Spalte', round(c['x0']), round(c['x1']))
    for p in info:
        x0, y0, x1, y1 = p['b']
        cx = (x0 + x1) / 2
        w = x1 - x0
        h = y1 - y0
        if cx < c['x0'] or cx > c['x1']:
            continue
        if w < 14 or h < 40:
            continue
        if y0 > 300:
            continue
        print('  fill=%-18s w=%5.1f h=%6.1f  x %6.1f..%6.1f  y %6.1f..%6.1f'
              % (p['fill'][:18], w, h, x0, x1, y0, y1))
