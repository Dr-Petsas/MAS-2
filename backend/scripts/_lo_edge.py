import json, numpy as np
from PIL import Image
PUB=r'F:\MAS-2\backend\public\m\lena-01'
CW,CH,SPLIT=1376,768,384
gum=np.array(Image.open(PUB+r'\gum-lo.png').convert('RGBA'))[:,:,3]>40
teeth=np.array(Image.open(PUB+r'\teeth-k.png').convert('RGBA'))[:,:,3]>40
cols=json.load(open(PUB+r'\perio-cols.json',encoding='utf-8'))['cols']
lo=[c for c in cols if not c['upper']]
lo=sorted(lo,key=lambda c:c['cx'])
def gum_edge(x):
    ys=np.where(gum[SPLIT:,x])[0]; return ys.min()+SPLIT if len(ys) else None
def crown_top(x):
    ys=np.where(teeth[SPLIT:,x])[0]; return ys.min()+SPLIT if len(ys) else None
print('fdi   cx   gumEdgeY  crownTopY  gap(gum-crown)')
for c in lo:
    x=int(c['cx']); g=gum_edge(x); t=crown_top(x)
    gap = (g-t) if (g and t) else None
    print(f"{c['fdi']:>3} {x:>5} {str(g):>8} {str(t):>9}   {str(gap):>6}")
