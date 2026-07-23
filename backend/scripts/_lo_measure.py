import json, numpy as np
from PIL import Image
from scipy.signal import find_peaks
PUB=r'F:\MAS-2\backend\public\m\lena-01'
CW,CH,SPLIT=1376,768,384
gum_lo=Image.open(PUB+r'\gum-lo.png').convert('RGBA')
a=np.array(gum_lo)[:,:,3]>40
# coronale Kante Unterkiefer = min y (Papillen zeigen nach oben)
edge=np.full(CW,np.nan)
for x in range(CW):
    ys=np.where(a[SPLIT:,x])[0]
    if len(ys): edge[x]=ys.min()+SPLIT
valid=np.where(~np.isnan(edge))[0]; xL,xR=int(valid.min()),int(valid.max())
print('gum-lo x extent',xL,xR)
e=edge.copy(); e[np.isnan(e)]=np.nanmax(e)
# Papillenspitzen = lokale Minima von y => Peaks von (-e)
pk,_=find_peaks(-e, distance=40, prominence=4)
pk=[int(p) for p in pk if xL+15<p<xR-15]
print('papilla peaks x:',pk)
# Kontaktpunkte (innere Spaltengrenzen) Unterkiefer
cols=json.load(open(PUB+r'\perio-cols.json',encoding='utf-8'))['cols']
lo=[c for c in cols if not c['upper']]
inner=sorted(set([round(c['x0']) for c in lo]+[round(c['x1']) for c in lo]))[1:-1]
print('contact pts x:',inner)
# Zuordnung Peak->naechster Kontaktpunkt + Versatz
for p in pk:
    j=min(inner,key=lambda q:abs(q-p))
    print(f'  peak {p:4d} -> contact {j:4d}  (drift {p-j:+d})')
# vertikale Kante je Segment (Median) fuer Q4-Check
def seg(x0,x1):
    v=edge[x0:x1]; v=v[~np.isnan(v)]
    return round(float(np.median(v)),1) if len(v) else None
print('median coronal y links(48..44) x120-360:',seg(120,360))
print('median coronal y front(43..33) x360-560:',seg(360,560))
print('median coronal y rechts(34..38) x560-760:',seg(560,760))
