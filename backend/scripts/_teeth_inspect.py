# -*- coding: utf-8 -*-
"""Inspektion teeth-source.svg: Fuellfarben, Pfad-Statistik, 17/27-Region."""
import re
import collections

SRC = r"F:\MAS-2\backend\public\m\lena-01\teeth-source.svg"
s = open(SRC, encoding="utf-8").read()
fills = re.findall(r'fill="([^"]+)"', s)
print("Fills:", collections.Counter(fills).most_common(25))
print("Anzahl paths:", s.count("<path"))
print("Groesse:", len(s))
print("strokes:", collections.Counter(re.findall(r'stroke="([^"]+)"', s)).most_common(10))
