import json, numpy as np
from PIL import Image, ImageDraw
PUB=r'F:\MAS-2\backend\public\m\lena-01'
CW,CH,SPLIT=1376,768,384
teeth=Image.open(PUB+r'\teeth-k.png').convert('RGBA')
gum=Image.open(PUB+r'\gum-lo.png').convert('RGBA')
bg=Image.new('RGBA',(CW,CH),(22,34,44,255))
comp=Image.alpha_composite(bg,teeth)
comp=Image.alpha_composite(comp,gum)
d=ImageDraw.Draw(comp)
cols=json.load(open(PUB+r'\perio-cols.json',encoding='utf-8'))['cols']
for c in cols:
    if c['upper']: continue
    for xb in (c['x0'],c['x1']):
        d.line([(xb,SPLIT),(xb,CH)],fill=(0,255,0,255),width=1)
crop=comp.crop((120,384,1260,620)).resize((1140*2,236*2))
crop.convert('RGB').save(PUB+r'\_lo_preview.png')
print('saved')
