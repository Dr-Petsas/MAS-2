"""
Backt ein gesundes Composite (perio-preview.png) fuer die Farbschema-Galerie
(perio-styles.html). Kombiniert die plastisch gebackenen Zaehne (teeth-k.png)
mit einem prozeduralen, gesunden Zahnfleischband – exakt mit den Konstanten aus
perio.js (STEP_GUM/PAP/PW/BAND/AAMP/APW), damit die Vorschau der echten Anzeige
entspricht. Auf dieses Bild legt die Galerie nur CSS-Filter.

Ausgabe: public/m/lena-01/perio-preview.png
"""
import json
import numpy as np
from PIL import Image, ImageDraw

PUB = r'F:\MAS-2\backend\public\m\lena-01'
BG = (36, 26, 21)                      # #241a15 – warm studio
STEP_GUM, PAP, PW, BAND, AAMP, APW = 7, 28, 22, 26, 12, 34
# 3-Stop-Verlauf fuer das Zahnfleisch (hell -> satt -> tief)
GSTOPS = [(0.0, (242, 182, 176)), (0.45, (221, 138, 138)), (1.0, (176, 96, 96))]

d = json.load(open(PUB + r'\perio-cols.json', encoding='utf-8'))
CW, CH, SPLIT = d['cw'], d['ch'], d['split']
cols = d['cols']
edges = d['edges']
contacts = d.get('contacts', {})


def smooth(arr, win):
    a = np.asarray(arr, float); n = len(a); h = win >> 1
    ps = np.concatenate([[0], np.cumsum(a)])
    out = np.empty(n)
    for i in range(n):
        lo = max(0, i - h); hi = min(n - 1, i + h)
        out[i] = (ps[hi + 1] - ps[lo]) / (hi - lo + 1)
    return out


def hump(cts, x, hw):
    best, bd = None, 1e9
    for t in cts:
        dd = abs(t - x)
        if dd < bd:
            bd, best = dd, t
    if best is None or bd >= hw:
        return 0.0
    return (1 + np.cos(np.pi * bd / hw)) / 2


def gum_poly(arch_cols, base, cts, upper):
    if not arch_cols:
        return []
    sc = 1 if upper else -1
    xs = sorted(arch_cols, key=lambda c: c['cx'])
    xL, xR = xs[0]['x0'], xs[-1]['x1']
    B = lambda x: base[max(0, min(CW - 1, int(round(x))))]
    top, bot = [], []
    x = xL
    while x <= xR:
        top.append((x, B(x) + sc * PAP * hump(cts, x, PW)))
        bot.append((x, B(x) + sc * AAMP * hump(cts, x, APW) - sc * BAND))
        x += STEP_GUM
    return top + bot[::-1]


img = Image.new('RGB', (CW, CH), BG)
teeth = Image.open(PUB + r'\teeth-k.png').convert('RGBA')
img.paste(teeth, (0, 0), teeth)

# vertikaler Rosa-Verlauf, per Gum-Maske eingeblendet
def ramp(t):
    for i in range(len(GSTOPS) - 1):
        t0, c0 = GSTOPS[i]; t1, c1 = GSTOPS[i + 1]
        if t <= t1:
            f = (t - t0) / max(1e-6, t1 - t0)
            return [int(c0[j] * (1 - f) + c1[j] * f) for j in range(3)]
    return list(GSTOPS[-1][1])
grad = np.zeros((CH, CW, 3), np.uint8)
for y in range(CH):
    grad[y, :, :] = ramp(y / (CH - 1))
grad = Image.fromarray(grad)

mask = Image.new('L', (CW, CH), 0)
mdraw = ImageDraw.Draw(mask)
bu = smooth(edges['gumUp'], 111)
bl = smooth(edges['gumLo'], 111)
for arch_cols, base, key, upper in (
    ([c for c in cols if c['upper']], bu, 'up', True),
    ([c for c in cols if not c['upper']], bl, 'lo', False),
):
    pts = gum_poly(arch_cols, base, contacts.get(key, []), upper)
    if len(pts) >= 3:
        mdraw.polygon([(float(x), float(y)) for x, y in pts], fill=235)

img.paste(grad, (0, 0), mask)
img.save(PUB + r'\perio-preview.png')
print('perio-preview.png gebacken', img.size)
