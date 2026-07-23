"""Probe: Warum bleiben beim Entfernen von UK-Molaren Reste stehen?

Simuliert die Client-Logik (perio.js):
  - Plastik-Ebene = teeth-k.png je Zahn auf Watershed-SIL geclippt (fehlender Zahn wird uebersprungen)
  - missLayer = SIL(fehlt) + Stroke 10 + achsenparalleles Bounds-Rechteck (missCoverBounds)
Vergleicht dagegen: mesial gekippte Schnitt-Kanten (Parallelogramm wie die
Watershed-Barrieren im Build-Skript).
"""
import json, re
import numpy as np
from PIL import Image, ImageDraw

PUB = r'F:\MAS-2\backend\public\m\lena-01'
CW, CH, SPLIT = 1376, 768, 384
MISS_BG = (36, 26, 21, 255)  # #241a15

meta = json.load(open(PUB + r'\perio-cols.json', encoding='utf-8'))
cols = meta['cols']; SIL = meta['sil']
teeth = Image.open(PUB + r'\teeth-k.png').convert('RGBA')

def sil_poly(fdi):
    d = SIL[str(fdi)]
    nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', d)]
    return [(nums[i], nums[i+1]) for i in range(0, len(nums)-1, 2)]

def sil_mask(fdi, stroke=0):
    m = Image.new('L', (CW, CH), 0)
    dr = ImageDraw.Draw(m)
    pts = sil_poly(fdi)
    dr.polygon(pts, fill=255)
    if stroke:
        dr.line(pts + [pts[0]], fill=255, width=stroke, joint='curve')
    return np.array(m) > 0

def bounds(fdi):
    pts = sil_poly(fdi)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs), max(xs), min(ys), max(ys)

def col_of(fdi):
    return next(c for c in cols if c['fdi'] == fdi)

def miss_cover_bounds(c):
    """1:1 wie missCoverBounds() in perio.js"""
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

BG_SRC = (18, 36, 50, 255)  # #122432 = Hintergrund der Original-Basisebene

def cover_edges(c):
    """Finales Design: Kanten je Kontakt. Senkrecht in der Front, gekippt sobald
    ein Molar beteiligt ist (Kipp wie Watershed-Barrieren: 28 bei 7er/8er, 20
    beim 6er-Kontakt), Richtung Kiefermitte-abgewandt (= distal)."""
    row = sorted([cc for cc in cols if cc['upper'] == c['upper']], key=lambda cc: cc['x0'])
    i = next(k for k, cc in enumerate(row) if cc['fdi'] == c['fdi'])
    n = c['fdi'] % 10
    def flare(nb):
        if nb is None: mx = n
        else: mx = max(n, nb['fdi'] % 10)
        if n < 6 and (nb is None or nb['fdi'] % 10 < 6): return 0
        return 28 if mx >= 7 else 20
    fL = flare(row[i - 1] if i > 0 else None)
    fR = flare(row[i + 1] if i + 1 < len(row) else None)
    # Kipprichtung je Kante: links der Bildmitte nach links, sonst rechts
    pad = 3
    xL, xR = c['x0'] - pad, c['x1'] + pad
    shL = -fL if xL < CW * 0.5 else fL
    shR = -fR if xR < CW * 0.5 else fR
    return xL, xR, shL, shR

def render(missing_fdi, cover_mode):
    """cover_mode: 'rect' (heute) oder 'tilt' (gekippte Kanten + BG-Farbe)"""
    fill = MISS_BG if cover_mode == 'rect' else BG_SRC
    out = Image.new('RGBA', (CW, CH), BG_SRC)
    comp = np.array(out)
    timg = np.array(teeth)
    # Basisebene: Originalbild VOLLFLAECHIG (wie teethImg im echten SVG)
    tm = timg[:, :, 3] > 40
    comp[tm] = timg[tm]
    # Plastik-Ebene: jeder nicht fehlende Zahn = Bild auf SIL geclippt
    for c in cols:
        if c['fdi'] == missing_fdi: continue
        m = sil_mask(c['fdi'])
        comp[m] = timg[m]
    out = Image.fromarray(comp)
    dr = ImageDraw.Draw(out)
    # missLayer: SIL + Stroke
    pts = sil_poly(missing_fdi)
    dr.polygon(pts, fill=fill)
    dr.line(pts + [pts[0]], fill=fill, width=10, joint='curve')
    c = col_of(missing_fdi)
    if cover_mode == 'rect':
        x0, x1, y0, y1 = miss_cover_bounds(c)
        dr.rectangle([x0, y0, x1, y1], fill=fill)
    else:
        xL, xR, shL, shR = cover_edges(c)
        y0, y1 = SPLIT, CH
        dr.polygon([(xL, y0), (xR, y0), (xR + shR, y1), (xL + shL, y1)], fill=fill)
    return out

for fdi in (47, 46, 37, 36, 38, 48):
    c = col_of(fdi)
    x0, x1, y0, y1 = miss_cover_bounds(c)
    print(fdi, 'cover-rect x', round(x0), '..', round(x1), ' col', c['x0'], c['x1'], ' silb', [round(v) for v in bounds(fdi)])
    ist = render(fdi, 'rect')
    neu = render(fdi, 'tilt')
    # Ausschnitt um den Zahn
    pad = 130
    box = (int(x0) - pad, SPLIT, int(x1) + pad, CH)
    a = ist.crop(box); b = neu.crop(box)
    canvas = Image.new('RGBA', (a.width, a.height * 2 + 8), (0, 0, 0, 255))
    canvas.paste(a, (0, 0)); canvas.paste(b, (0, a.height + 8))
    canvas = canvas.resize((canvas.width * 2, canvas.height * 2), Image.LANCZOS)
    canvas.convert('RGB').save(PUB + r'\..\..\..\scripts\_tilt_%d.png' % fdi)
print('ok')
