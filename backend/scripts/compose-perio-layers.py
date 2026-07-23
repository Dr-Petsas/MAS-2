"""
Setzt die drei gelieferten SVGs zu EINER Datei zusammen:
  z-Reihenfolge:  Knochen (hinten) -> Zaehne -> Zahnfleisch (vorne)
Zahnfleisch liegt in 1280x720 und wird per Transform in 1376x768 eingepasst.
Hintergrund-Rechtecke der Quellen werden entfernt.
"""
import re, sys

DIR = r'C:\Users\Anmeldung2\Downloads\odont'
CW, CH = 1376, 768

def load(f, cw, ch):
    c = open(DIR+'\\'+f, encoding='utf-8', errors='replace').read()
    inner = c[c.index('>', c.index('<svg'))+1 : c.rindex('</svg>')]
    defs = ''
    md = re.search(r'<defs>.*?</defs>', inner, re.S)
    if md:
        defs = md.group(0)
        inner = inner.replace(defs, '')
    # Pfade + evtl. rects sammeln, Hintergrund (fast volle Flaeche) verwerfen
    els = re.findall(r'<path\b[^>]*?/>|<path\b.*?</path>|<rect\b[^>]*?/>', inner, re.S)
    kept = []
    for e in els:
        d = re.search(r'\sd="([^"]+)"', e)
        if d:
            ns = [float(n) for n in re.findall(r'-?\d+\.?\d*', d.group(1))]
            xs, ys = ns[0::2], ns[1::2]
            if xs and (max(xs)-min(xs))>0.95*cw and (max(ys)-min(ys))>0.95*ch:
                continue
        else:
            # rect als bg?
            if 'width' in e and 'height' in e:
                w = re.search(r'width="([\d.]+)"', e); h = re.search(r'height="([\d.]+)"', e)
                if w and h and float(w.group(1))>0.95*cw and float(h.group(1))>0.95*ch:
                    continue
        kept.append(e)
    return defs, ''.join(kept)

bone_defs, bone = load('bone SVG.svg', 1376, 768)
teeth_defs, teeth = load('teethSVG.svg', 1376, 768)
gum_defs, gum = load('gum SVG.svg', 1280, 720)

# Transform fuer Zahnfleisch (1280x720 -> 1376x768). Start: uniform scale + zentrieren.
GX = float(sys.argv[1]) if len(sys.argv)>1 else 1.0
GY = float(sys.argv[2]) if len(sys.argv)>2 else 1.0
TX = float(sys.argv[3]) if len(sys.argv)>3 else 0.0
TY = float(sys.argv[4]) if len(sys.argv)>4 else 0.0
gum_tf = f'translate({TX},{TY}) scale({GX},{GY})'

out = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
       f'width="{CW}" height="{CH}" viewBox="0 0 {CW} {CH}">'
       f'<rect width="{CW}" height="{CH}" fill="#16222c"/>'
       f'{bone_defs}{teeth_defs}{gum_defs}'
       f'<g id="bone">{bone}</g>'
       f'<g id="teeth">{teeth}</g>'
       f'<g id="gum" transform="{gum_tf}">{gum}</g>'
       f'</svg>')
open(r'F:\MAS-2\backend\public\m\lena-01\_tw\compose.svg','w',encoding='utf-8').write(out)

# Render
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
renderPM.drawToFile(svg2rlg(r'F:\MAS-2\backend\public\m\lena-01\_tw\compose.svg'),
                    r'F:\MAS-2\backend\public\m\lena-01\_tw\compose.png', fmt='PNG')
print('composed. gum transform =', gum_tf)
