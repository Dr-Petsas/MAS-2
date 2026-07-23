import json, numpy as np
from PIL import Image, ImageDraw
PUB=r'F:\MAS-2\backend\public\m\lena-01'
CW,CH,SPLIT=1376,768,384
meta=json.load(open(PUB+r'\perio-cols.json',encoding='utf-8'))
cols=meta['cols']; MM=meta['mm']
teeth_m=np.array(Image.open(PUB+r'\teeth-k.png').convert('RGBA'))[:,:,3]>40

def neck_y(c):
    """Zervikale Einschnuerung: von der Kronenspitze Richtung Wurzel, wo die
    Zahnbreite unter ~62% der max. Kronenbreite faellt."""
    x0,x1=int(c['x0']),int(c['x1']); upper=c['upper']
    w=np.array([teeth_m[y,x0:x1].sum() for y in range(CH)])
    if upper:
        ys=np.where(w[:SPLIT]>2)[0]
        if len(ys)<3: return 250
        top=ys.min()  # Wurzelseite (klein y), unten = Krone (gross y)
        crown=range(SPLIT-1, top, -1)   # von Krone (gross y) nach oben
    else:
        ys=np.where(w[SPLIT:]>2)[0]+SPLIT
        if len(ys)<3: return 520
        crown=range(SPLIT, ys.max())    # von Krone (klein y) nach unten
    wmax=max(w[list(crown)]) if len(list(crown)) else 1
    wmax=w[SPLIT:ys.max()].max() if not upper else w[top:SPLIT].max()
    thr=0.62*wmax
    if upper:
        # Krone bei grossem y; Hals = wo Breite Richtung kleines y unter thr faellt
        seq=range(SPLIT-1, top-1, -1)
    else:
        seq=range(SPLIT, ys.max()+1)
    hit=None; seen_crown=False
    for y in seq:
        if w[y]>=wmax*0.9: seen_crown=True
        if seen_crown and w[y]<thr: hit=y; break
    return hit if hit is not None else (top+ (SPLIT-top)//2 if upper else ys.max()-(ys.max()-SPLIT)//2)

def smooth(a, win):
    a=np.array(a,float); k=win|1; pad=np.pad(a,(k//2,k//2),mode='edge')
    return np.array([pad[i:i+k].mean() for i in range(len(a))])

def cos_interp(cxs, cys, X):
    out=np.empty(len(X)); j=0
    for i,x in enumerate(X):
        while j<len(cxs)-2 and x>cxs[j+1]: j+=1
        x0,x1=cxs[j],cxs[j+1]; y0,y1=cys[j],cys[j+1]
        t=0 if x1==x0 else (x-x0)/(x1-x0); t=min(1,max(0,t))
        tt=(1-np.cos(np.pi*t))/2; out[i]=y0*(1-tt)+y1*tt
    return out

PAP=28.0; PW=22.0; BAND=26.0; STEP_GUM=7
AAMP=12.0; APW=34.0; OVERLAP=6.0
EDG=meta['edges']

def smooth_closed_poly(pts):
    """quadratische Glaettung (wie perio.js smoothClosed), fein abgetastet -> Polygon"""
    n=len(pts); mid=lambda a,b:((a[0]+b[0])/2,(a[1]+b[1])/2)
    out=[]
    for i in range(n):
        c=pts[i]; nx=pts[(i+1)%n]; p0=mid(pts[(i-1)%n],c); p1=mid(c,nx)
        for t in np.linspace(0,1,8):
            x=(1-t)**2*p0[0]+2*(1-t)*t*c[0]+t*t*p1[0]
            y=(1-t)**2*p0[1]+2*(1-t)*t*c[1]+t*t*p1[1]
            out.append((x,y))
    return [(int(x),int(y)) for x,y in out]

def build(upper):
    cs=sorted([c for c in cols if c['upper']==upper], key=lambda c:c['cx'])
    sc=1 if upper else -1
    base=smooth(EDG['gumUp'] if upper else EDG['gumLo'], 111)
    def B(x): return base[int(min(CW-1,max(0,round(x))))]
    xL=cs[0]['x0']; xR=cs[-1]['x1']
    ctx=meta['contacts']['up' if upper else 'lo']
    cts=[ctx[i] for i in range(min(len(ctx),len(cs)-1))]
    def hump(x, hw):
        if not cts: return 0.0
        xb=min(cts,key=lambda q:abs(q-x)); d=abs(x-xb)
        return 0.0 if d>=hw else (1+np.cos(np.pi*d/hw))/2
    def yC(x): return B(x)+sc*PAP*hump(x,PW)
    def yA(x): return B(x)+sc*AAMP*hump(x,APW)-sc*BAND
    pts=[(x,yC(x)) for x in range(int(xL),int(xR)+1,STEP_GUM)]
    pts+=[(xR,yC(xR))]
    pts+=[(x,yA(x)) for x in range(int(xR),int(xL)-1,-STEP_GUM)]
    poly=smooth_closed_poly(pts)
    return poly, None, None

teeth=Image.open(PUB+r'\teeth-k.png').convert('RGBA')
bone=Image.open(PUB+r'\bone-k.png').convert('RGBA')
bg=Image.new('RGBA',(CW,CH),(22,34,44,255))
comp=Image.alpha_composite(bg,teeth)

# Knochen wie live clippen: Kante = weiche Girlande (yA) + Overlap Richtung Krone
def bone_crest(upper):
    cs=sorted([c for c in cols if c['upper']==upper], key=lambda c:c['cx'])
    sc=1 if upper else -1
    base=smooth(EDG['gumUp'] if upper else EDG['gumLo'], 111)
    def B(x): return base[int(min(CW-1,max(0,round(x))))]
    ctx=meta['contacts']['up' if upper else 'lo']
    cts=[ctx[i] for i in range(min(len(ctx),len(cs)-1))]
    def hump(x,hw):
        if not cts: return 0.0
        xb=min(cts,key=lambda q:abs(q-x)); d=abs(x-xb)
        return 0.0 if d>=hw else (1+np.cos(np.pi*d/hw))/2
    xL=cs[0]['x0']; xR=cs[-1]['x1']
    crest=np.full(CW, np.nan)
    for x in range(int(xL),int(xR)+1):
        crest[x]=B(x)+sc*AAMP*hump(x,APW)-sc*BAND+sc*OVERLAP
    return crest
comp_b=np.array(bone).copy(); comp_b[:,:,3]=(comp_b[:,:,3]*0.75).astype(np.uint8)
for up in (True,False):
    crest=bone_crest(up)
    for x in range(CW):
        c=crest[x]
        if np.isnan(c):
            # ausserhalb Zahnreihe: kompletten Knochen zeigen
            continue
        if up:
            comp_b[int(c):SPLIT,x,3]=0   # OK: unterhalb der Kante (Richtung Krone) weg
        else:
            comp_b[SPLIT:int(c),x,3]=0   # UK: oberhalb der Kante (Richtung Krone) weg
comp=Image.alpha_composite(comp,Image.fromarray(comp_b))
gum=Image.new('RGBA',(CW,CH),(0,0,0,0)); dg=ImageDraw.Draw(gum)
for up in (True,False):
    poly,_,_=build(up); dg.polygon(poly, fill=(226,141,141,255))
comp=Image.alpha_composite(comp,gum)
comp.convert('RGB').save(PUB+r'\_gen_gum.png')
print('saved _gen_gum.png  PAP',PAP,'BAND',BAND)
