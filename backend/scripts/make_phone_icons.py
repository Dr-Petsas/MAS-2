# -*- coding: utf-8 -*-
"""Erzeugt das Pickadoc-Logo-Mark + die Clara-Phone-App-Icons in der CI-Farbwelt.

Quelle: weisses calendR-Logo (Wortmarke wird abgeschnitten, nur das Mark links).
Output: public/m/logo-mark.png, icon-512/192/96.png, apple-touch-icon.png
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

SRC = sys.argv[1]
OUT_DIR = r"F:\MAS-2\backend\public\m"

TURQUOISE = (46, 230, 200)
BG_TOP = (13, 23, 38)
BG_BOTTOM = (6, 11, 22)

src = Image.open(SRC).convert("RGBA")
# Wortmarke "calendR" wegschneiden: das Mark sitzt links (x 0..190), bbox 1..178/4..160
mark = src.crop((0, 0, 190, src.height))
bbox = mark.getbbox()
mark = mark.crop(bbox)

# 1) Weisses Mark fuer den Seiten-Header (mit etwas Luft)
pad = 8
header = Image.new("RGBA", (mark.width + 2 * pad, mark.height + 2 * pad), (0, 0, 0, 0))
header.paste(mark, (pad, pad), mark)
header.save(rf"{OUT_DIR}\logo-mark.png")
print("logo-mark.png", header.size)


def tinted(img, rgb):
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    px = img.load()
    po = out.load()
    for y in range(img.height):
        for x in range(img.width):
            a = px[x, y][3]
            if a:
                po[x, y] = (rgb[0], rgb[1], rgb[2], a)
    return out


def make_icon(size):
    icon = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(icon)
    # vertikaler Verlauf dunkelnavy
    for y in range(size):
        t = y / size
        c = tuple(int(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=c + (255,))
    # dezenter tuerkiser Schein hinter der Mitte
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = int(size * 0.34)
    gd.ellipse([size // 2 - r, size // 2 - r, size // 2 + r, size // 2 + r], fill=TURQUOISE + (90,))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.10))
    icon.alpha_composite(glow)

    # Mark: tuerkiser Glow + weisses Mark obendrauf
    target_w = int(size * 0.58)
    scale = target_w / mark.width
    m = mark.resize((target_w, int(mark.height * scale)), Image.LANCZOS)
    mx = (size - m.width) // 2
    my = (size - m.height) // 2

    neon = tinted(m, TURQUOISE).filter(ImageFilter.GaussianBlur(max(2, size * 0.02)))
    icon.alpha_composite(neon, (mx, my))
    icon.alpha_composite(m, (mx, my))
    return icon


for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("icon-96.png", 96), ("apple-touch-icon.png", 180)]:
    make_icon(size).convert("RGBA").save(rf"{OUT_DIR}\{name}")
    print(name, size)
