"""
Baut die PAR-Ebenen aus den drei gelieferten PNGs (bone/teeth/gum).

WICHTIG: Die gelieferten SVGs und PNGs liegen NICHT im selben Koordinatenraum
(SVG-Pfade enden bei ~1258/648, die PNGs fuellen 1376/768). Deshalb werden die
Ebenen aus den PNGs "gebacken" (Hintergrund transparent, Transform einge-
rechnet) und als <image> gerendert. So sind Messung (Spalten/Kanten/Silhouetten)
und Anzeige garantiert deckungsgleich.

Ausgabe:
  public/m/lena-01/teeth-k.png  bone-k.png  gum-up.png  gum-lo.png
  public/m/lena-01/perio-layers.svg   (Bild-Ebenen: Zaehne -> Knochen0.75 -> Gum)
  public/m/lena-01/perio-cols.json    (cols, edges pro x, silhouettes)

Transforms (per Simulation kalibriert):
  OK-Gum: scale(1.13,1.15) translate(-30,-4)         (hoeher + breiter)
  UK-Gum: scale(1.075,1.0667) +y 8, CCW 1.5deg um (688,560)  (Q4 tiefer)
Knochen liegt UEBER den Zaehnen mit opacity 0.75 -> Abbau sichtbar.
"""
import json
import numpy as np, cv2
from PIL import Image
from scipy.signal import find_peaks

DIR = r'C:\Users\Anmeldung2\Downloads\odont'
PUB = r'F:\MAS-2\backend\public\m\lena-01'
CW, CH, SPLIT = 1376, 768, 384
SHIFT_X = 6

OK_SX, OK_SY, OK_TX, OK_TY = 1.102, 1.15, -10, -4
UK_SX, UK_SY, UK_TY = CW/1280.0, CH/720.0, 8
UK_SHEAR_K, UK_SHEAR_X0 = 0.0137, 1150   # Q4 (links) tiefer, rechts fix

# ------------------------------------------------------------ keyed layer helper
def key(img):
    img = img.convert('RGBA'); a = np.array(img)
    r,g,b = a[:,:,0].astype(int),a[:,:,1].astype(int),a[:,:,2].astype(int)
    a[:,:,3] = np.where((r<58)&(g<64)&(b<80), 0, 255)
    return Image.fromarray(a)

teeth = key(Image.open(DIR+r'\teeth.png').resize((CW,CH)))
bone  = key(Image.open(DIR+r'\bone.png').resize((CW,CH)))
gum   = Image.open(DIR+r'\gum.png')

# Knochen KOMPLETT anzeigen: keine seitliche Verbreiterung mehr.
# Der Quell-Knochen fuellt bereits die volle Breite (x 62..1375) und ist lateral
# breiter als die Zaehne (x 124..1375). Eine Skalierung >1 schob die Enden aus
# dem Canvas (-> abgeschnitten). Deshalb bleibt der Knochen unveraendert.

# OK-Gum backen (Warp folgt weiter unten, sobald die Spalten bekannt sind)
up = key(gum.crop((0,0,1280,360))).resize((int(1280*OK_SX), int(360*OK_SY)))
gum_up = Image.new('RGBA',(CW,CH),(0,0,0,0)); gum_up.alpha_composite(up,(OK_TX,OK_TY))
# UK-Gum backen (uniform, runter, Q4 per Shear tiefer – rechts unveraendert)
lo = key(gum.resize((CW,CH))).crop((0,384,CW,CH))
gum_lo = Image.new('RGBA',(CW,CH),(0,0,0,0)); gum_lo.alpha_composite(lo,(0,384+UK_TY))
_k=UK_SHEAR_K
gum_lo = gum_lo.transform((CW,CH), Image.AFFINE, (1,0,0,_k,1,-_k*UK_SHEAR_X0), resample=Image.BICUBIC)

def alpha(img): return np.array(img)[:,:,3] > 40
teeth_m = alpha(teeth); bone_m = alpha(bone)

# --------------------------------------------- Plastik/Kontrast-Backing (3D "nass")
# Ziel: Wurzeln heller (Kontrast zum Knochen), plastische 3D-Anmutung mit Glanz.
ta = np.array(teeth).astype(float); tm = teeth_m
R,G,B = ta[:,:,0], ta[:,:,1], ta[:,:,2]
V = ta[:,:,:3].max(2)/255.0
# Krone = helle, wenig blaustichige Flaeche; groesste zusammenhaengende Regionen
crown = ((V>0.80)&((R-B)<40)&tm).astype(np.uint8)
crown = cv2.morphologyEx(crown, cv2.MORPH_CLOSE, np.ones((7,7),np.uint8))
crown = cv2.morphologyEx(crown, cv2.MORPH_OPEN,  np.ones((3,3),np.uint8))
ncc,lab,stats,_ = cv2.connectedComponentsWithStats(crown,8)
crown_big = np.zeros_like(crown)
for i in range(1,ncc):
    if stats[i,cv2.CC_STAT_AREA] > 300: crown_big[lab==i] = 1
root = tm & (crown_big==0)
# Wurzeln deutlich heller (cremig) -> starker Kontrast zum warmen Knochen
cream = np.array([245,236,217], float)
for ch in range(3):
    ta[root,ch] = ta[root,ch]*0.52 + cream[ch]*0.48
# 3D-Bevel: Distanztransform -> Raender dunkler, Kern leicht heller (Rundung)
dist = cv2.distanceTransform(tm.astype(np.uint8), cv2.DIST_L2, 5)
bevel = np.clip(dist/14.0, 0, 1)
shade = 0.82 + 0.24*bevel
for ch in range(3):
    ta[:,:,ch] = np.where(tm, ta[:,:,ch]*shade, ta[:,:,ch])
# dezenter, feuchter Glanz nur auf dunkleren (Wurzel-)Flaechen -> Krone nicht ueberstrahlen
vn = np.clip(ta[:,:,:3].max(2)/255.0, 0, 1)
gloss = np.clip((dist-12.0)/10.0, 0, 1) * 26.0 * (1.0 - vn)
for ch in range(3):
    ta[:,:,ch] = np.where(tm, ta[:,:,ch]+gloss, ta[:,:,ch])
# vertikaler, warmer Farbverlauf pro Zahn: Glanzband an der Zahnhals-/CEJ-Zone,
# waermer/tiefer zu Wurzelspitze und Schneide -> keramischer "nasser" Verlauf.
Y = np.repeat(np.arange(CH)[:, None], CW, axis=1).astype(float)
tU = tm.copy(); tU[SPLIT:, :] = False       # Oberkiefer-Zaehne
tL = tm.copy(); tL[:SPLIT, :] = False       # Unterkiefer-Zaehne
with np.errstate(all='ignore'):
    yyU = np.where(tU, Y, np.nan); yminU = np.nanmin(yyU, 0); ymaxU = np.nanmax(yyU, 0)
    yyL = np.where(tL, Y, np.nan); yminL = np.nanmin(yyL, 0); ymaxL = np.nanmax(yyL, 0)
tnorm = np.zeros((CH, CW))
denU = np.where(np.isnan(ymaxU - yminU), 1, ymaxU - yminU); denU[denU < 1] = 1
denL = np.where(np.isnan(ymaxL - yminL), 1, ymaxL - yminL); denL[denL < 1] = 1
ttU = (Y - np.nan_to_num(yminU)[None, :]) / denU[None, :]          # 0 Apex(oben)..1 Schneide
ttL = (np.nan_to_num(ymaxL)[None, :] - Y) / denL[None, :]          # 0 Apex(unten)..1 Schneide
tnorm[tU] = np.clip(ttU[tU], 0, 1)
tnorm[tL] = np.clip(ttL[tL], 0, 1)
band = np.sin(np.pi * tnorm)                # 1 in der Mitte (CEJ), 0 an den Enden
bf = 0.93 + 0.13 * band                     # Glanzband in der Zahnhalszone
warmR = 1.0 + 0.05 * (1.0 - band)           # Enden waermer (mehr Rot)
warmB = 1.0 - 0.05 * (1.0 - band)           # Enden weniger Blau
ta[:, :, 0] = np.where(tm, ta[:, :, 0] * bf * warmR, ta[:, :, 0])
ta[:, :, 1] = np.where(tm, ta[:, :, 1] * bf,          ta[:, :, 1])
ta[:, :, 2] = np.where(tm, ta[:, :, 2] * bf * warmB, ta[:, :, 2])

ta[:,:,:3] = np.clip(ta[:,:,:3], 0, 255)
teeth = Image.fromarray(ta.astype(np.uint8))

# Knochen minimal Richtung Rot/warm + etwas dunkler -> Wurzeln heben sich ab
ba = np.array(bone).astype(float)
gg = ba[:,:,:3].mean(2, keepdims=True)
ba[:,:,:3] = ba[:,:,:3]*0.90 + gg*0.10            # leicht entsaettigt (Basis)
ba[:,:,0] *= 1.08                                 # minimal mehr Rot
ba[:,:,1] *= 0.99
ba[:,:,2] *= 0.92                                 # Blau leicht raus -> warm
ba[:,:,:3] = np.clip(ba[:,:,:3]*0.93, 0, 255)     # etwas dunkler
bone = Image.fromarray(ba.astype(np.uint8))

teeth.save(PUB+r'\teeth-k.png'); bone.save(PUB+r'\bone-k.png')

# ------------------------------------------------------------ Spalten (Kronen-Band)
def prof(m,y0,y1): return m[y0:y1,:].sum(axis=0)
def content(p,thr=3):
    xs=np.where(p>thr)[0]; return int(xs.min()),int(xs.max())
def valleys(p,n,xlo,xhi):
    span=xhi-xlo; sep=int(span/(n*1.8))
    cand=sorted(range(xlo+sep,xhi-sep), key=lambda x:p[x]); ch=[]
    for x in cand:
        if all(abs(x-c)>sep for c in ch): ch.append(x)
        if len(ch)==n-1: break
    return sorted(ch)

up_c=prof(teeth_m,270,310); lo_c=prof(teeth_m,450,485)
uxc=content(up_c); lxc=content(lo_c)
uvc=valleys(up_c,16,*uxc); lvc=valleys(lo_c,16,*lxc)
OK_FDI=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]
UK_FDI=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]

def cols_from(bounds, xr, fdis, upper):
    edges=[xr[0]]+bounds+[xr[1]]
    edges=[min(CW,max(0,e+SHIFT_X)) for e in edges]
    return [{'fdi':fdis[i],'upper':upper,'x0':round(edges[i],1),
             'x1':round(edges[i+1],1),'cx':round((edges[i]+edges[i+1])/2,1)}
            for i in range(len(fdis))]
cols = cols_from(uvc,uxc,OK_FDI,True) + cols_from(lvc,lxc,UK_FDI,False)

# --------------------- OK-Gum: Papillen in Approximalraum-Mitte warpen ----------
# Nichtlinearer horizontaler Warp: jede Papillenspitze -> Zahn-Kontaktpunkt
# (Mitte des Approximalraums). Die ganze Spalte (Saum + knochenseitiger Bogen)
# bewegt sich parallel mit. Enden sind verankert (dort ist der Versatz gering).
def warp_x(img, in_pts, out_pts):
    a=np.array(img); W=a.shape[1]
    outX=np.arange(W)
    inX=np.interp(outX, out_pts, in_pts)         # Umkehrabbildung out->in
    x0=np.clip(np.floor(inX).astype(int),0,W-1)
    x1=np.clip(x0+1,0,W-1); fr=(inX-x0)[None,:,None]
    res=(a[:,x0,:]*(1-fr)+a[:,x1,:]*fr).astype(np.uint8)
    return Image.fromarray(res)

def warp_to_contacts(img, upper, inner, tag):
    """Robuster Papillen->Kontaktpunkt-Warp: jede erkannte Papillenspitze wird dem
    NAECHSTEN Kontaktpunkt zugeordnet (eine pro Kontakt, kleinster Drift gewinnt).
    An den Reihen-Enden verankert. Funktioniert auch, wenn nicht jede Papille
    erkannt wird (kein starres Zippen)."""
    a=np.array(img)[:,:,3]>40
    ed=np.full(CW,np.nan)
    for x in range(CW):
        ys=np.where(a[:SPLIT,x])[0] if upper else np.where(a[SPLIT:,x])[0]
        if len(ys): ed[x]=(ys.max() if upper else ys.min()+SPLIT)
    valid=np.where(~np.isnan(ed))[0]
    if len(valid)<4: return img
    xL,xR=int(valid.min()),int(valid.max())
    e=ed.copy(); e[np.isnan(e)]=(np.nanmin(e) if upper else np.nanmax(e))
    sig = e if upper else -e                      # OK: Papille=Max, UK: Papille=Min
    pk,_=find_peaks(sig, distance=40, prominence=4)
    pk=[int(p) for p in pk if xL+15<p<xR-15]
    used={}
    for p in pk:
        j=min(inner,key=lambda q:abs(q-p))
        if j not in used or abs(p-j)<abs(used[j]-j): used[j]=p
    pairs=sorted((used[j],j) for j in used)
    if not pairs: return img
    ip=[xL]+[p for p,_ in pairs]+[xR]
    op=[xL]+[c for _,c in pairs]+[xR]
    for i in range(1,len(ip)):
        if ip[i]<=ip[i-1]: ip[i]=ip[i-1]+1
        if op[i]<=op[i-1]: op[i]=op[i-1]+1
    print('%s-Warp: %d Papillen -> Kontaktpunkte'%(tag,len(pairs)))
    return warp_x(img, np.array(ip,float), np.array(op,float))

_ge=np.full(CW,np.nan); _gu=np.array(gum_up)[:,:,3]>40
for x in range(CW):
    ys=np.where(_gu[:,x])[0]
    if len(ys): _ge[x]=ys.max()               # koronale Kante (Papillen = Maxima)
_valid=np.where(~np.isnan(_ge))[0]; _xL,_xR=int(_valid.min()),int(_valid.max())
_e=_ge.copy(); _e[np.isnan(_e)]=np.nanmin(_e)
_pk,_=find_peaks(_e, distance=40, prominence=4)
_pk=sorted([p for p in _pk if _xL+15<p<_xR-15])
_ok_inner=sorted(set([round(c['x0']) for c in cols if c['upper']]+
                     [round(c['x1']) for c in cols if c['upper']]))[1:-1]
_n=min(len(_pk),len(_ok_inner))
_in=[_xL]+_pk[:_n]+[_xR]; _out=[_xL]+_ok_inner[:_n]+[_xR]
# strikt monoton absichern
for i in range(1,len(_in)):
    if _in[i]<=_in[i-1]: _in[i]=_in[i-1]+1
    if _out[i]<=_out[i-1]: _out[i]=_out[i-1]+1
gum_up = warp_x(gum_up, np.array(_in,float), np.array(_out,float))
print('OK-Warp: %d Papillen -> Kontaktpunkte'%_n)

# UK-Gum: gleiche Girlanden-Ausrichtung wie oben (Papille -> Kontaktpunkt)
_uk_inner=sorted(set([round(c['x0']) for c in cols if not c['upper']]+
                     [round(c['x1']) for c in cols if not c['upper']]))[1:-1]
gum_lo = warp_to_contacts(gum_lo, False, _uk_inner, 'UK')

# Q4 (Zaehne 44..48, Bildschirm-links) sitzt zu tief -> progressiv anheben.
# 0 ab Kontaktpunkt 44|43, zunehmend nach distal (links). Front (33..43) bleibt.
UK_Q4_X, UK_Q4_LIFT = 532, 9
_al=np.array(gum_lo)
_xl=np.where((_al[:,:,3]>40).any(axis=0))[0]; _xLg=int(_xl.min()) if len(_xl) else 0
for x in range(0, UK_Q4_X):
    sh=int(round(UK_Q4_LIFT*(UK_Q4_X-x)/max(1,(UK_Q4_X-_xLg))))
    if sh>0:
        _al[:,x,:]=np.roll(_al[:,x,:], -sh, axis=0); _al[-sh:,x,:]=0
gum_lo=Image.fromarray(_al)

gum_up.save(PUB+r'\gum-up.png'); gum_lo.save(PUB+r'\gum-lo.png')
gumU_m = alpha(gum_up); gumL_m = alpha(gum_lo)

# ------------------------------------------------------------ koronale Kanten pro x
def coronal(m, upper):
    out=[None]*CW
    for x in range(CW):
        ys=np.where(m[:SPLIT,x])[0] if upper else np.where(m[SPLIT:,x])[0]
        if len(ys): out[x]=int(ys.max()) if upper else int(ys.min())+SPLIT
    return out
def apical(m, upper):
    """Kante Richtung Wurzel (OK: min y, UK: max y) – hier setzt der Knochen an."""
    out=[None]*CW
    for x in range(CW):
        ys=np.where(m[:SPLIT,x])[0] if upper else np.where(m[SPLIT:,x])[0]
        if len(ys): out[x]=int(ys.min()) if upper else int(ys.max())+SPLIT
    return out
def fill_smooth(arr, base):
    a=np.array([v if v is not None else np.nan for v in arr],dtype=float)
    idx=np.arange(CW); good=~np.isnan(a)
    if good.sum()==0: return [base]*CW
    a=np.interp(idx, idx[good], a[good])
    k=9; pad=np.pad(a,(k//2,k//2),mode='edge')
    a=np.array([np.median(pad[i:i+k]) for i in range(CW)])
    return [round(float(v),1) for v in a]
def med(arr): return int(np.nanmedian([v for v in arr if v is not None]))

# Knochen setzt an der APIKALEN Zahnfleischkante an (nicht vom Gum ueberdeckt)
boneU=apical(gumU_m,True);  boneL=apical(gumL_m,False)
gU=coronal(gumU_m,True);    gL=coronal(gumL_m,False)
B_UP,B_LO,G_UP,G_LO = med(boneU),med(boneL),med(gU),med(gL)
edges={'boneUp':fill_smooth(boneU,B_UP),'boneLo':fill_smooth(boneL,B_LO),
       'gumUp':fill_smooth(gU,G_UP),'gumLo':fill_smooth(gL,G_LO)}

# ------------------------------------------------------------ Silhouetten (Watershed)
# Beruehrende Zaehne sauber trennen: Saat je Zahn-Mitte + Hintergrund-Saat,
# Watershed folgt den dunklen Kontaktlinien der Zeichnung.
teeth_rgb = np.array(Image.open(DIR+r'\teeth.png').convert('RGB').resize((CW,CH)))
def seed_y(cx, upper):
    band = range(260,320) if upper else range(440,495)
    ys=[y for y in band if teeth_m[y, min(CW-1,max(0,int(cx)))]]
    return int(np.median(ys)) if ys else (290 if upper else 465)
markers = np.zeros((CH,CW), np.int32)
markers[~teeth_m] = 1
lab_of = {}
for i,c in enumerate(cols):
    cx=int(c['cx']); sy=seed_y(cx, c['upper'])
    cv2.circle(markers,(cx,sy),7,i+2,-1); lab_of[i+2]=str(c['fdi'])
# UK-Molaren: Trennlinien zur Mitte inklinieren (sonst schneiden Vertikalen
# die distal ausladenden Wurzeln). Hintergrund-Barrieren von Kronenkontakt
# nach apikal distal-auswaerts zeichnen.
_uk = [c for c in cols if not c['upper']]
_uk.sort(key=lambda c: c['x0'])
for i in range(len(_uk)-1):
    L, R = _uk[i], _uk[i+1]
    ln, rn = int(L['fdi']) % 10, int(R['fdi']) % 10
    if ln < 6 and rn < 6:
        continue
    x_crown = int(round((L['x1'] + R['x0']) / 2))
    # Distalflare: Q4 (links, kleinere x) -> Apex weiter links; Q3 -> weiter rechts
    mid = (L['cx'] + R['cx']) / 2
    flare = 28 if max(ln, rn) >= 7 else 20
    # Trennlinie neigt sich zur Kiefermitte: apikal weiter nach distal
    if mid < CW * 0.5:
        x_apex = x_crown - flare
    else:
        x_apex = x_crown + flare
    y0, y1 = SPLIT + 8, CH - 4
    cv2.line(markers, (x_crown, y0), (int(x_apex), y1), 1, 2)
cv2.watershed(teeth_rgb, markers)
def contour_path(lab):
    reg=(markers==lab).astype(np.uint8)*255
    reg=cv2.morphologyEx(reg, cv2.MORPH_CLOSE, np.ones((5,5),np.uint8))
    cnts,_=cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts: return ''
    cc=max(cnts,key=cv2.contourArea)
    ap=cv2.approxPolyDP(cc,1.8,True)
    pts=[(round(float(p[0][0]),1),round(float(p[0][1]),1)) for p in ap]
    return ('M '+' L '.join(f'{x} {y}' for x,y in pts)+' Z') if len(pts)>=3 else ''
sil={fdi:contour_path(lab) for lab,fdi in lab_of.items()}

# ------------------------------------------------------------ SVG (Bild-Ebenen)
def img_el(id_, href):
    return (f'<image id="{id_}" x="0" y="0" width="{CW}" height="{CH}" '
            f'href="/m/lena-01/{href}" preserveAspectRatio="none"/>')
out = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
       f'width="{CW}" height="{CH}" viewBox="0 0 {CW} {CH}">'
       f'<rect width="{CW}" height="{CH}" fill="#241a15"/>'
       f'{img_el("teethImg","teeth-k.png?v=7")}'
       f'<g id="boneLayer" opacity="0.75"></g>'
       f'<g id="gumLayer"></g>'
       f'</svg>')
open(PUB+r'\perio-layers.svg','w',encoding='utf-8').write(out)

# echte Kontaktpunkte (Kronen-Taeler, OHNE SHIFT_X) fuer die Papillenspitzen
contacts={'up':[float(v) for v in uvc], 'lo':[float(v) for v in lvc]}
meta={'cw':CW,'ch':CH,'split':SPLIT,'mm':6.0,
      'bases':{'boneUp':B_UP,'boneLo':B_LO,'gumUp':G_UP,'gumLo':G_LO},
      'edges':edges,'sil':sil,'cols':cols,'contacts':contacts}
open(PUB+r'\perio-cols.json','w',encoding='utf-8').write(json.dumps(meta,ensure_ascii=False))
print('cols',len(cols),'| bases',meta['bases'],'| sil',sum(1 for v in sil.values() if v))
print('baked PNGs + perio-layers.svg + perio-cols.json')
