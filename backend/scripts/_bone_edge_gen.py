"""bone-edge.json neu erzeugen: koronale Knochenkante je Spalte aus bone-k.png.

Neu gegenueber v1: x0/x1 je Kiefer = erste/letzte Spalte, in der der Knochen
mindestens MIN_TH Pixel dick ist -> das Zahnfleischband endet auf solidem
Knochen statt auf dem duennen Auslaeufer (Befund distal 28).
"""
import json
import numpy as np
from PIL import Image

PUB = r"F:\MAS-2\backend\public\m\lena-01"
CW, CH, SPLIT = 1376, 768, 384
MIN_TH = 9          # Mindest-Knochendicke (px) fuer das Bandende
ALPHA = 40

img = Image.open(PUB + r"\bone-k.png").convert("RGBA")
if img.size != (CW, CH):
    img = img.resize((CW, CH))
mask = np.array(img)[:, :, 3] > ALPHA

out = {}
for key, upper in (("up", True), ("lo", False)):
    half = mask[:SPLIT] if upper else mask[SPLIT:]
    y_off = 0 if upper else SPLIT
    edge = [None] * CW
    thick = np.zeros(CW, int)
    for x in range(CW):
        ys = np.where(half[:, x])[0]
        if len(ys) == 0:
            continue
        thick[x] = len(ys)
        # koronale Kante = dem Zahn zugewandt: OK unten (max y), UK oben (min y)
        edge[x] = int((ys.max() if upper else ys.min()) + y_off)
    solid = np.where(thick >= MIN_TH)[0]
    x0, x1 = int(solid.min()), int(solid.max())
    print(key, "solid", x0, x1, " any:", int(np.where(thick > 0)[0].min()),
          int(np.where(thick > 0)[0].max()),
          " Dicke an Enden:", int(thick[x0]), int(thick[x1]))
    out[key] = {"x0": x0, "x1": x1, "edge": edge}

with open(PUB + r"\bone-edge.json", "w", encoding="utf-8") as f:
    json.dump(out, f)
print("geschrieben:", PUB + r"\bone-edge.json")
