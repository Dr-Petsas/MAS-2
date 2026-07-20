# -*- coding: utf-8 -*-
"""Repariert UTF-8-als-cp1252-Mojibake (z.B. 'FlÃ¤che' -> 'Fläche')."""
import pathlib

targets = "äöüÄÖÜßéèáàçñ·–—…°→←•’‘‚«»½¼¾×\u201c\u201e\u201d"
mapping = {}
for ch in targets:
    try:
        moji = ch.encode("utf-8").decode("cp1252")
        if moji != ch:
            mapping[moji] = ch
    except Exception:
        pass

keys = sorted(mapping.keys(), key=len, reverse=True)
files = [
    r"F:\MAS-2\backend\public\m\ipad-app.html",
    r"F:\MAS-2\backend\public\m\lena-01\perio.js",
    r"F:\MAS-2\backend\public\m\lena-01\perio.html",
    r"F:\MAS-2\backend\public\m\lena-01\perio.css",
    r"F:\MAS-2\backend\public\m\lena-01\perio-legend.js",
    r"F:\MAS-2\backend\public\m\lena-01\perio-chart.js",
    r"F:\MAS-2\backend\public\m\lena-01\index.html",
]
for f in files:
    p = pathlib.Path(f)
    s = p.read_text(encoding="utf-8")
    orig = s
    for k in keys:
        s = s.replace(k, mapping[k])
    if s != orig:
        p.write_text(s, encoding="utf-8", newline="")
        print(f, "repariert | Reste A~:", s.count("\u00c3"), "| a??:", s.count("\u00e2\u20ac"))
    else:
        print(f, "ok | A~:", s.count("\u00c3"), "| a??:", s.count("\u00e2\u20ac"))
