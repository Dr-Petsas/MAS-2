"""
Baut aus dem geteilten Auto-Trace (odontogramSVG.svg) ein GRUPPIERTES SVG
fuer die Parodontologie-Ansicht. Es werden KEINE Pfade neu gezeichnet – die
Original-Kunst bleibt 1:1 erhalten. Nur die Pfade werden nach Farbe (Zahn /
Knochen / Zahnfleisch / Hintergrund) und nach Kiefer (OK/UK) in <g>-Schichten
sortiert, damit Knochen und Zahnfleisch spaeter absenkbar sind.

Schicht-Reihenfolge je Kiefer (hinten -> vorne):
  teeth (volle Krone+Wurzel)  ->  bone  ->  gingiva
So verdeckt das Gewebe die Wurzel; sinkt es ab, wird die cremefarbene Wurzel frei.
"""
import re, os

SRC = r'C:\Users\Anmeldung2\Downloads\odontogramSVG.svg'
OUT = r'F:\MAS-2\backend\public\m\lena-01\perio-real.svg'

c = open(SRC, encoding='utf-8', errors='replace').read()
m = re.search(r'<svg[^>]*>', c)
svg_open = m.group(0)
vb = re.search(r'viewBox="([^"]+)"', svg_open)
w = re.search(r'width="(\d+)"', svg_open)
h = re.search(r'height="(\d+)"', svg_open)
VW = int(w.group(1)) if w else 1280
VH = int(h.group(1)) if h else 720

paths = re.findall(r'<path\s+fill="([^"]+)"\s+d="([^"]+)"\s*/>', c)

def rgb(hx):
    hx = hx.lstrip('#')
    return int(hx[0:2],16), int(hx[2:4],16), int(hx[4:6],16)

def classify(hexcol):
    try:
        r,g,b = rgb(hexcol)
    except Exception:
        return 'bone'
    mx, mn = max(r,g,b), min(r,g,b)
    V = mx/255.0
    sat = 0 if mx==0 else (mx-mn)/mx
    if V < 0.30:
        return 'bg'
    # Creme (Zahn): hell, wenig gesaettigt UND kleiner Rot-Gruen-Abstand.
    # Rosa/Zahnfleisch hat grossen Rot-Gruen-Abstand -> faellt hier raus.
    if V > 0.78 and sat < 0.32 and (r-g) < 26:
        return 'teeth'
    if V >= 0.86:
        return 'gingiva'
    return 'bone'

def bbox(d):
    nums = [float(n) for n in re.findall(r'-?\d+\.?\d*', d)]
    xs, ys = nums[0::2], nums[1::2]
    if not xs or not ys:
        return None
    return (min(xs), min(ys), max(xs), max(ys))

# Kiefer-Trennung automatisch: y-Luecke zwischen den Boegen finden
cys = []
for fill, d in paths:
    if classify(fill) == 'bg':
        continue
    b = bbox(d)
    if b:
        cys.append((b[1]+b[3])/2)
# Histogramm 20px-Bins, duennste Zeile im Mittelband als Trenner
import collections
hist = collections.Counter(int(y//20*20) for y in cys)
band = [(hist.get(y,0), y) for y in range(int(VH*0.28), int(VH*0.55), 20)]
split_y = min(band)[1] + 10 if band else VH/2
print('arch split y =', split_y)

layers = {
    'ok': {'teeth':[], 'bone':[], 'gingiva':[]},
    'uk': {'teeth':[], 'bone':[], 'gingiva':[]},
}
bg = []
for fill, d in paths:
    cls = classify(fill)
    if cls == 'bg':
        bg.append((fill,d)); continue
    b = bbox(d)
    cy = (b[1]+b[3])/2 if b else VH/2
    arch = 'ok' if cy < split_y else 'uk'
    layers[arch][cls].append((fill,d))

def grp(gid, items):
    inner = ''.join(f'<path fill="{f}" d="{d}"/>' for f,d in items)
    return f'<g id="{gid}">{inner}</g>'

bg_paths = ''.join(f'<path fill="{f}" d="{d}"/>' for f,d in bg)
body = bg_paths
for arch in ('ok','uk'):
    body += grp(f'{arch}-teeth', layers[arch]['teeth'])
    body += grp(f'{arch}-bone',  layers[arch]['bone'])
    body += grp(f'{arch}-gingiva', layers[arch]['gingiva'])

out = svg_open + body + '</svg>'
open(OUT,'w',encoding='utf-8').write(out)
print('written', OUT, len(out), 'bytes')
for arch in ('ok','uk'):
    print(arch, {k:len(v) for k,v in layers[arch].items()})
