# -*- coding: utf-8 -*-
"""Dunkle Alveolen-Flaechen in bone-k.png analysieren."""
from PIL import Image
import numpy as np

img = np.array(Image.open(r'F:\MAS-2\backend\public\m\lena-01\bone-k.png').convert('RGBA'))
a = img[:, :, 3].astype(int)
rgb = img[:, :, :3].astype(int)
lum = rgb.mean(axis=2)

mask = (a > 200) & (lum < 90)
print('sehr dunkle opake Pixel:', mask.sum())
ys, xs = np.where(mask)
if len(xs):
    print('x-Bereich', xs.min(), xs.max(), 'y-Bereich', ys.min(), ys.max())

# Histogramm der Luminanz im Wurzelbereich von Zahn 16 (x 295..390, y 150..260)
crop = lum[150:260, 295:390]
ca = a[150:260, 295:390]
vals = crop[ca > 200]
for t in [40, 60, 80, 100, 120, 140]:
    print('lum <', t, ':', int((vals < t).sum()), '/', vals.size)
# Beispiel-Farben der dunkelsten Pixel dort
sel = (ca > 200) & (crop < 80)
py, px = np.where(sel)
if len(px):
    cols = img[150:260, 295:390][sel][:, :3]
    print('Beispiel dunkle Farben:', cols[:8].tolist())
    print('Mittel dunkel:', cols.mean(axis=0).round(0))
