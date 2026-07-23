"""Rechnerische Verifikation: Cover-Varianten fuer fehlende UK-Zaehne.

Fuer jeden UK-Zahn (fehlend gedacht):
  A) Reste     = Pixel des ORIGINAL-Zahns (teeth-Maske innerhalb der eigenen
                 Watershed-Zelle ODER als Fragment in Nachbar-Zellen), die vom
                 Cover (SIL+Stroke10 + Rechteck/Parallelogramm) NICHT abgedeckt sind.
  B) Anschnitt = Pixel der NACHBAR-Zellen (deren eigene Zahnpixel), die das
                 Cover FAELSCHLICH abdeckt (senkrechte/gekippte Kante schneidet rein).
Watershed wird wie im Build-Skript reproduziert (gleiche Seeds/Barrieren).
"""
import json, re
import numpy as np, cv2
from PIL import Image, ImageDraw

PUB = r'F:\MAS-2\backend\public\m\lena-01'
CW, CH, SPLIT = 1376, 768, 384

meta = json.load(open(PUB + r'\perio-cols.json', encoding='utf-8'))
cols = meta['cols']; SIL = meta['sil']

teeth_img = Image.open(PUB + r'\teeth-k.png').convert('RGBA')
teeth_m = np.array(teeth_img)[:, :, 3] > 40

# Watershed wie build-perio-layers.py (Seeds + UK-Barrieren)
teeth_rgb = np.array(teeth_img.convert('RGB'))
def seed_y(cx, upper):
    band = range(260, 320) if upper else range(440, 495)
    ys = [y for y in band if teeth_m[y, min(CW - 1, max(0, int(cx)))]]
    return int(np.median(ys)) if ys else (290 if upper else 465)
markers = np.zeros((CH, CW), np.int32)
markers[~teeth_m] = 1
lab_of = {}
for i, c in enumerate(cols):
    cx = int(c['cx']); sy = seed_y(cx, c['upper'])
    cv2.circle(markers, (cx, sy), 7, i + 2, -1); lab_of[c['fdi']] = i + 2
_uk = sorted([c for c in cols if not c['upper']], key=lambda c: c['x0'])
for i in range(len(_uk) - 1):
    L, R = _uk[i], _uk[i + 1]
    ln, rn = int(L['fdi']) % 10, int(R['fdi']) % 10
    if ln < 6 and rn < 6: continue
    x_crown = int(round((L['x1'] + R['x0']) / 2))
    mid = (L['cx'] + R['cx']) / 2
    flare = 28 if max(ln, rn) >= 7 else 20
    x_apex = x_crown - flare if mid < CW * 0.5 else x_crown + flare
    cv2.line(markers, (x_crown, SPLIT + 8), (int(x_apex), CH - 4), 1, 2)
cv2.watershed(teeth_rgb, markers)

def sil_poly(fdi):
    d = SIL[str(fdi)]
    nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', d)]
    return [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]

def sil_cover_mask(fdi):
    m = Image.new('L', (CW, CH), 0)
    dr = ImageDraw.Draw(m)
    pts = sil_poly(fdi)
    dr.polygon(pts, fill=255)
    dr.line(pts + [pts[0]], fill=255, width=10, joint='curve')
    return np.array(m) > 0

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

def rect_mask(x0, x1, y0, y1):
    m = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(m).rectangle([x0, y0, x1, y1], fill=255)
    return np.array(m) > 0

def para_mask(c, tilt_extra=0, drop_flare=False):
    """Parallelogramm: Kronenkante wie Rechteck (optional ohne Flare),
    Apexkante mesial gekippt (q4: -, q3: +)."""
    fdi = c['fdi']; q = fdi // 10; n = fdi % 10
    x0, x1 = c['x0'], c['x1']
    bx0, bx1, by0, by1 = bounds(fdi)
    x0 = min(x0, bx0 - 5); x1 = max(x1, bx1 + 5)
    if not drop_flare and n >= 6:
        flare = 22 if n >= 8 else 16 if n == 7 else 12
        if q in (1, 4): x0 -= flare
        if q in (2, 3): x1 += flare
    y0, y1 = SPLIT, CH
    f = (28 if n >= 7 else 20) + tilt_extra
    sh = -f if q == 4 else f
    m = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(m).polygon([(x0, y0), (x1, y0), (x1 + sh, y1), (x0 + sh, y1)], fill=255)
    return np.array(m) > 0

def trapez_mask(c, pad=2):
    """Wie geplanter Fix: Kronenkante = Spaltengrenze +/- pad (ohne SIL-Bounds,
    ohne Flare), je Kante eigener Kipp (Kontakt-Flare wie im Build-Skript:
    28 bei 7er/8er-Kontakt, sonst 20), Richtung distal (q4: -, q3: +)."""
    fdi = c['fdi']; q = fdi // 10
    row = sorted([cc for cc in cols if not cc['upper']], key=lambda cc: cc['x0'])
    i = next(k for k, cc in enumerate(row) if cc['fdi'] == fdi)
    def flare_of(a, b):
        return 28 if max(a % 10, b % 10) >= 7 else 20
    fL = flare_of(fdi, row[i - 1]['fdi']) if i > 0 else 28
    fR = flare_of(fdi, row[i + 1]['fdi']) if i + 1 < len(row) else 28
    d = -1 if q == 4 else 1
    x0, x1 = c['x0'] - pad, c['x1'] + pad
    y0, y1 = SPLIT, CH
    m = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(m).polygon(
        [(x0, y0), (x1, y0), (x1 + d * fR, y1), (x0 + d * fL, y1)], fill=255)
    return np.array(m) > 0

def trapez_sil_mask(c, pad=5):
    """Variante: Kronenkante inkl. SIL-Bounds (wie ist, ohne Flare), je Kante
    eigener Kontakt-Kipp."""
    fdi = c['fdi']; q = fdi // 10
    bx0, bx1, _, _ = bounds(fdi)
    row = sorted([cc for cc in cols if not cc['upper']], key=lambda cc: cc['x0'])
    i = next(k for k, cc in enumerate(row) if cc['fdi'] == fdi)
    def flare_of(a, b):
        return 28 if max(a % 10, b % 10) >= 7 else 20
    fL = flare_of(fdi, row[i - 1]['fdi']) if i > 0 else 28
    fR = flare_of(fdi, row[i + 1]['fdi']) if i + 1 < len(row) else 28
    d = -1 if q == 4 else 1
    x0 = min(c['x0'], bx0 - pad); x1 = max(c['x1'], bx1 + pad)
    y0, y1 = SPLIT, CH
    m = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(m).polygon(
        [(x0, y0), (x1, y0), (x1 + d * fR, y1), (x0 + d * fL, y1)], fill=255)
    return np.array(m) > 0

def final_poly_mask(c, pad=3):
    """Finale Kanten-Logik wie geplanter perio.js-Fix: Pad nur an gekippten
    Kanten (Molar-Kontakt), Front-Kanten exakt auf der Spaltgrenze."""
    fdi = c['fdi']; n = fdi % 10
    row = sorted([cc for cc in cols if cc['upper'] == c['upper']], key=lambda cc: cc['x0'])
    i = next(k for k, cc in enumerate(row) if cc['fdi'] == fdi)
    def flare(nb):
        nn = nb['fdi'] % 10 if nb else n
        if n < 6 and (nb is None or nn < 6): return 0
        return 28 if max(n, nn) >= 7 else 20
    fL = flare(row[i - 1] if i > 0 else None)
    fR = flare(row[i + 1] if i + 1 < len(row) else None)
    xL = c['x0'] - (pad if fL else 0)
    xR = c['x1'] + (pad if fR else 0)
    shL = -fL if xL < CW * 0.5 else fL
    shR = -fR if xR < CW * 0.5 else fR
    y0, y1 = SPLIT, CH
    m = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(m).polygon(
        [(xL, y0), (xR, y0), (xR + shR, y1), (xL + shL, y1)], fill=255)
    return np.array(m) > 0

lower_all = [c['fdi'] for c in sorted([c for c in cols if not c['upper']], key=lambda c: c['x0'])]
print('%-4s %-14s %8s %10s' % ('FDI', 'Variante', 'Reste', 'Anschnitt'))
for fdi in lower_all:
    c = col_of(fdi)
    own_cell = markers == lab_of[fdi]
    own_tooth = teeth_m & own_cell
    # Fragmente des Zahns in Nachbar-Zellen: Zahnpixel ausserhalb aller
    # fremden ZAEHNE lassen sich pixelgenau nicht trennen; Naeherung:
    # Zahnpixel im Spaltenbereich +/- 60, die NICHT zur eigenen Zelle und
    # NICHT zu einem Nachbar-SEED-Zahn gehoeren, sind mehrdeutig. Wir pruefen
    # daher beide Groessen getrennt:
    #   Reste  = eigene Zellpixel, die das Cover nicht abdeckt
    #   Anschn = fremde Zellpixel (Zahnpixel), die das Cover abdeckt
    sil_m = sil_cover_mask(fdi)
    x0, x1, y0, y1 = miss_cover_bounds(c)
    variants = {
        'rect (ist)': sil_m | rect_mask(x0, x1, y0, y1),
        'final': sil_m | final_poly_mask(c),
    }
    other_cells = teeth_m & (markers > 1) & ~own_cell
    for name, cov in variants.items():
        rest = int((own_tooth & ~cov).sum())
        cut = int((other_cells & cov).sum())
        print('%-4d %-14s %8d %10d' % (fdi, name, rest, cut))
    print()
