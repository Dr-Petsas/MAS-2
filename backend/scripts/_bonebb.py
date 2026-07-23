import numpy as np
from PIL import Image
DIR = r'C:\Users\Anmeldung2\Downloads\odont'
CW,CH,SPLIT=1376,768,384
def key(img):
    img=img.convert('RGBA'); a=np.array(img)
    r,g,b=a[:,:,0].astype(int),a[:,:,1].astype(int),a[:,:,2].astype(int)
    a[:,:,3]=np.where((r<58)&(g<64)&(b<80),0,255)
    return Image.fromarray(a)

raw=Image.open(DIR+r'\bone.png')
print('bone.png raw size', raw.size)
a0=key(raw); m0=np.array(a0)[:,:,3]>40
xs=np.where(m0.any(axis=0))[0]; ys=np.where(m0.any(axis=1))[0]
print('raw content x',int(xs.min()),int(xs.max()),'of',raw.size[0],' y',int(ys.min()),int(ys.max()),'of',raw.size[1])

bone=key(raw.resize((CW,CH)))
a=np.array(bone)[:,:,3]>40
lo=a.copy(); lo[:SPLIT]=False
# lower molar tooth extent
teeth=key(Image.open(DIR+r'\teeth.png').resize((CW,CH)))
tm=np.array(teeth)[:,:,3]>40
tlo=tm.copy(); tlo[:SPLIT]=False
txs=np.where(tlo.any(axis=0))[0]
print('teeth-lo content x',int(txs.min()),int(txs.max()))
bxs=np.where(lo.any(axis=0))[0]
print('bone-lo content x',int(bxs.min()),int(bxs.max()))
