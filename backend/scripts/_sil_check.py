import json, re
from PIL import Image, ImageDraw
PUB=r'F:\MAS-2\backend\public\m\lena-01'
meta=json.load(open(PUB+r'\perio-cols.json',encoding='utf-8'))
sil=meta['sil']
teeth=Image.open(PUB+r'\teeth-k.png').convert('RGBA')
bg=Image.new('RGBA',teeth.size,(22,34,44,255))
comp=Image.alpha_composite(bg,teeth).convert('RGB')
d=ImageDraw.Draw(comp)
def pts(dstr):
    nums=re.findall(r'[-\d.]+', dstr)
    return [(float(nums[i]),float(nums[i+1])) for i in range(0,len(nums)-1,2)]
for fdi,dstr in sil.items():
    if not dstr: continue
    p=pts(dstr)
    if len(p)>=3: d.line(p+[p[0]], fill=(0,255,180),width=2)
comp.save(PUB+r'\_sil_check.png')
print('teeth silhouettes drawn:', sum(1 for v in sil.values() if v))
