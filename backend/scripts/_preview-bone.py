import numpy as np
from PIL import Image
PUB=r'F:\MAS-2\backend\public\m\lena-01'
teeth=Image.open(PUB+r'\teeth-k.png').convert('RGBA')
bone=Image.open(PUB+r'\bone-k.png').convert('RGBA')
CW,CH=teeth.size
bg=Image.new('RGBA',(CW,CH),(22,34,44,255))
comp=Image.alpha_composite(bg,teeth)
b=np.array(bone); b[:,:,3]=(b[:,:,3]*0.75).astype(np.uint8)
comp=Image.alpha_composite(comp,Image.fromarray(b))
m=np.array(bone)[:,:,3]>40
xs=np.where(m.any(axis=0))[0]
print('bone content shown x',int(xs.min()),int(xs.max()),'of',CW)
comp.convert('RGB').save(PUB+r'\_preview-bone.png')
print('saved _preview-bone.png')
