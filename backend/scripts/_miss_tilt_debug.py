"""Debug: Cover-Kanten (senkrecht vs. gekippt) als Linien ueber dem vollen Bild."""
import json, re
import numpy as np
from PIL import Image, ImageDraw

PUB = r'F:\MAS-2\backend\public\m\lena-01'
CW, CH, SPLIT = 1376, 768, 384

meta = json.load(open(PUB + r'\perio-cols.json', encoding='utf-8'))
cols = meta['cols']; SIL = meta['sil']
teeth = Image.open(PUB + r'\teeth-k.png').convert('RGBA')

def sil_poly(fdi):
    d = SIL[str(fdi)]
    nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', d)]
    return [(nums[i], nums[i+1]) for i in range(0, len(nums)-1, 2)]

def bounds(fdi):
    pts = sil_poly(fdi)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs), max(xs), min(ys), max(ys)

def col_of(fdi):
    return next(c for c in cols if c['fdi'] == fdi)

def miss_cover_bounds(c):
    x0, x1 = c['x0'], c['x1']
    y0 = 0 if c['upper'] else SPLIT
    y1 = SPLIT if c['upper'] else CH
    bx0, bx1, by0, by1 = bounds(c['fdi'])
    x0 = min(x0, bx0 - 5); x1 = max(x1, bx1 + 5)
    y0 = min(y0, by0 - 5); y1 = max(y1, by1 + 5)
    n = c['fdi'] % 10; q = c['fdi'] // 10
    if n >= 6:
        flare = 22 if n >= 8 else 16 if n == 7 else 12
        if q in (1, 4): x0 -= flare
        if q in (2, 3): x1 += flare
    return max(0, x0), min(CW, x1), max(0, y0), min(CH, y1)

fdi = 47
c = col_of(fdi)
x0, x1, y0, y1 = miss_cover_bounds(c)
base = Image.new('RGBA', (CW, CH), (36, 26, 21, 255))
base.alpha_composite(teeth)
dr = ImageDraw.Draw(base)
# Watershed-SIL von 47 (gruen)
dr.line(sil_poly(fdi) + [sil_poly(fdi)[0]], fill=(0, 220, 0, 255), width=2)
# IST-Rechteck (rot)
dr.rectangle([x0, y0, x1, y1], outline=(255, 60, 60, 255), width=2)
# Gekippt (cyan): Apex nach distal (q4: links)
sh = -28
dr.polygon([(x0, y0), (x1, y0), (x1 + sh, y1), (x0 + sh, y1)], outline=(60, 200, 255, 255), width=2)
# Spaltengrenzen (gelb gestrichelt)
for xx in (c['x0'], c['x1']):
    for yy in range(SPLIT, CH, 12):
        dr.line([(xx, yy), (xx, yy + 6)], fill=(255, 220, 0, 255), width=1)
pad = 150
crop = base.crop((int(x0) - pad, SPLIT, int(x1) + pad, CH))
crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
crop.convert('RGB').save(r'F:\MAS-2\backend\scripts\_tilt_debug_47.png')
print('rect', round(x0), round(x1), ' col', c['x0'], c['x1'])
