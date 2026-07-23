import json, numpy as np
from PIL import Image, ImageDraw
PUB=r'F:\MAS-2\backend\public\m\lena-01'
CW,CH,SPLIT=1376,768,384
meta=json.load(open(PUB+r'\perio-cols.json',encoding='utf-8'))
cols=meta['cols']; EDG=meta['edges']; MM=meta['mm']
PAP,PW,BAND=28.0,22.0,26.0; AAMP,APW,OVERLAP=12.0,34.0,6.0; STEP_GUM=7
def smooth(a,win):
    a=np.array(a,float);k=win|1;pad=np.pad(a,(k//2,k//2),mode='edge')
    return np.array([pad[i:i+k].mean() for i in range(len(a))])
def scp(pts):
    n=len(pts);mid=lambda a,b:((a[0]+b[0])/2,(a[1]+b[1])/2);out=[]
    for i in range(n):
        c=pts[i];nx=pts[(i+1)%n];p0=mid(pts[(i-1)%n],c);p1=mid(c,nx)
        for t in np.linspace(0,1,8):
            x=(1-t)**2*p0[0]+2*(1-t)*t*c[0]+t*t*p1[0]; y=(1-t)**2*p0[1]+2*(1-t)*t*c[1]+t*t*p1[1]
            out.append((int(x),int(y)))
    return out
MISSING={33}
teeth=Image.open(PUB+r'\teeth-k.png').convert('RGBA')
bone=Image.open(PUB+r'\bone-k.png').convert('RGBA')
bg=Image.new('RGBA',(CW,CH),(22,34,44,255))
comp=Image.alpha_composite(bg,teeth)
# Fehlt-Rechteck (dunkel) ueber Zahn, VOR Knochen
dr=ImageDraw.Draw(comp)
for c in cols:
    if c['fdi'] in MISSING:
        y0=0 if c['upper'] else SPLIT; y1=SPLIT if c['upper'] else CH
        dr.rectangle([c['x0'],y0,c['x1'],y1], fill=(22,34,44,255))
# Knochen (0.75) geclippt auf weiche Girlande
def crest(up):
    cs=sorted([c for c in cols if c['upper']==up],key=lambda c:c['cx']);sc=1 if up else -1
    base=smooth(EDG['gumUp'] if up else EDG['gumLo'],111)
    ctx=meta['contacts']['up' if up else 'lo'];cts=[ctx[i] for i in range(min(len(ctx),len(cs)-1))]
    def B(x):return base[int(min(CW-1,max(0,round(x))))]
    def hump(x,hw):
        if not cts:return 0.0
        xb=min(cts,key=lambda q:abs(q-x));d=abs(x-xb);return 0.0 if d>=hw else (1+np.cos(np.pi*d/hw))/2
    xL=cs[0]['x0'];xR=cs[-1]['x1'];cr=np.full(CW,np.nan)
    for x in range(int(xL),int(xR)+1):cr[x]=B(x)+sc*AAMP*hump(x,APW)-sc*BAND+sc*OVERLAP
    return cr
cb=np.array(bone).copy();cb[:,:,3]=(cb[:,:,3]*0.75).astype(np.uint8)
for up in (True,False):
    cr=crest(up)
    for x in range(CW):
        c=cr[x]
        if np.isnan(c):continue
        if up:cb[int(c):SPLIT,x,3]=0
        else:cb[SPLIT:int(c),x,3]=0
comp=Image.alpha_composite(comp,Image.fromarray(cb))
# Zahnfleisch
gum=Image.new('RGBA',(CW,CH),(0,0,0,0));dg=ImageDraw.Draw(gum)
for up in (True,False):
    cs=sorted([c for c in cols if c['upper']==up],key=lambda c:c['cx']);sc=1 if up else -1
    base=smooth(EDG['gumUp'] if up else EDG['gumLo'],111)
    ctx=meta['contacts']['up' if up else 'lo'];cts=[ctx[i] for i in range(min(len(ctx),len(cs)-1))]
    def B(x):return base[int(min(CW-1,max(0,round(x))))]
    def hump(x,hw):
        if not cts:return 0.0
        xb=min(cts,key=lambda q:abs(q-x));d=abs(x-xb);return 0.0 if d>=hw else (1+np.cos(np.pi*d/hw))/2
    def yC(x):return B(x)+sc*PAP*hump(x,PW)
    def yA(x):return B(x)+sc*AAMP*hump(x,APW)-sc*BAND
    xL=cs[0]['x0'];xR=cs[-1]['x1']
    pts=[(x,yC(x)) for x in range(int(xL),int(xR)+1,STEP_GUM)]+[(xR,yC(xR))]+[(x,yA(x)) for x in range(int(xR),int(xL)-1,-STEP_GUM)]
    dg.polygon(scp(pts),fill=(226,141,141,255))
comp=Image.alpha_composite(comp,gum)
c33=[c for c in cols if c['fdi']==33][0]
x0=int(c33['x0']-140);x1=int(c33['x1']+140)
comp.crop((x0,384,x1,660)).resize(((x1-x0)*2,276*2)).convert('RGB').save(PUB+r'\_miss_check.png')
print('saved (missing 33) x',x0,x1)
