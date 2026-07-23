"""
Erzeugt aus dem geteilten Trace die ZAHN-BASIS fuer die Parodontologie:
  1) perio-teeth.svg  – nur die cremefarbenen Zahn-Pfade (Krone + volle Wurzel),
                        1:1 aus deinem SVG, auf dunklem Hintergrund.
  2) perio-teeth.json – Geometrie je Zahn (FDI, Mitte, Hals-Linie, Wurzelspitze),
                        damit Knochen/Zahnfleisch sauber ueber die Wurzel gelegt
                        und pro Zahn gesteuert werden koennen.
Es wird KEIN Zahn neu gezeichnet – nur sortiert und vermessen.
"""
import re, os, json

SRC = r'C:\Users\Anmeldung2\Downloads\odontogramSVG.svg'
OUT_SVG = r'F:\MAS-2\backend\public\m\lena-01\perio-teeth.svg'
OUT_JSON = r'F:\MAS-2\backend\public\m\lena-01\perio-teeth.json'

c = open(SRC, encoding='utf-8', errors='replace').read()
head = c[:c.index('>', c.index('<svg'))+1]
paths = re.findall(r'<path\s+fill="([^"]+)"\s+d="([^"]+)"\s*/>', c)

VW, VH = 1280, 720

def rgb(h):
    h=h.lstrip('#'); return int(h[0:2],16),int(h[2:4],16),int(h[4:6],16)

def is_tooth(hx):
    try: r,g,b=rgb(hx)
    except: return False
    mx=max(r,g,b); mn=min(r,g,b); V=mx/255; sat=0 if mx==0 else (mx-mn)/mx
    return V>0.78 and sat<0.32 and (r-g)<26

def bbox(d):
    nums=[float(n) for n in re.findall(r'-?\d+\.?\d*', d)]
    xs, ys = nums[0::2], nums[1::2]
    if not xs: return None
    return (min(xs),min(ys),max(xs),max(ys))

teeth = [(f,d) for f,d in paths if is_tooth(f)]
# Kiefer-Trennung
SPLIT = 250  # OK oben (y<250), UK unten
ok = []; uk = []
for f,d in teeth:
    b = bbox(d)
    cy = (b[1]+b[3])/2 if b else VH/2
    (ok if cy < SPLIT else uk).append((f,d,b))

def cluster(items, n=16):
    pts = [(it, (it[2][0]+it[2][2])/2) for it in items if it[2]]
    pts.sort(key=lambda p:p[1])
    if not pts: return []
    lo=pts[0][1]; hi=pts[-1][1]
    centers=[lo+(hi-lo)*(i+0.5)/n for i in range(n)]
    buckets=[[] for _ in range(n)]
    for _ in range(30):
        buckets=[[] for _ in range(n)]
        for it,cx in pts:
            k=min(range(n), key=lambda i:abs(cx-centers[i]))
            buckets[k].append((it,cx))
        for i in range(n):
            if buckets[i]:
                centers[i]=sum(cx for _,cx in buckets[i])/len(buckets[i])
    cols=[]
    for i in range(n):
        b=buckets[i]
        if not b: cols.append(None); continue
        xs0=[it[2][0] for it,_ in b]; xs1=[it[2][2] for it,_ in b]
        ys0=[it[2][1] for it,_ in b]; ys1=[it[2][3] for it,_ in b]
        cols.append({'cx':round(sum(cx for _,cx in b)/len(b),1),
                     'x0':round(min(xs0),1),'x1':round(max(xs1),1),
                     'ymin':round(min(ys0),1),'ymax':round(max(ys1),1)})
    return cols

ok_cols = cluster(ok)
uk_cols = cluster(uk)
OK_FDI=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]
UK_FDI=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]

teeth_meta=[]
def add(cols, fdis, upper):
    for col,fdi in zip(cols, fdis):
        if not col: continue
        h = col['ymax']-col['ymin']
        if upper:
            # OK: Wurzel oben (ymin), Krone unten (ymax); Hals ~58% von oben
            neckY = round(col['ymin'] + 0.56*h, 1)
            apexY = col['ymin']
        else:
            # UK: Krone oben (ymin), Wurzel unten (ymax); Hals ~26% von oben
            neckY = round(col['ymin'] + 0.27*h, 1)
            apexY = col['ymax']
        teeth_meta.append({'fdi':fdi,'arch':'ok' if upper else 'uk','upper':upper,
                           'cx':col['cx'],'x0':col['x0'],'x1':col['x1'],
                           'neckY':neckY,'apexY':apexY,'ymin':col['ymin'],'ymax':col['ymax']})
add(ok_cols, OK_FDI, True)
add(uk_cols, UK_FDI, False)

# perio-teeth.svg schreiben (nur Zaehne + BG)
body = f'<rect width="{VW}" height="{VH}" fill="#101a22"/>'
body += ''.join(f'<path fill="{f}" d="{d}"/>' for f,d in teeth)
open(OUT_SVG,'w',encoding='utf-8').write(head + body + '</svg>')
open(OUT_JSON,'w',encoding='utf-8').write(json.dumps({'vw':VW,'vh':VH,'teeth':teeth_meta}, ensure_ascii=False, indent=0))
print('teeth paths', len(teeth), '| OK', sum(1 for c in ok_cols if c), '| UK', sum(1 for c in uk_cols if c))
print('written', OUT_SVG)
print('written', OUT_JSON, '(', len(teeth_meta), 'Zaehne )')
