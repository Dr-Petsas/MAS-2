# -*- coding: utf-8 -*-
"""Rendert die 17/27-Region aus teeth-source.svg gross als PNG (Playwright)."""
import asyncio
import json
import pathlib
import re

SRC = pathlib.Path(r"F:\MAS-2\backend\public\m\lena-01\teeth-source.svg")
COLS = json.loads(pathlib.Path(
    r"F:\MAS-2\backend\public\m\lena-01\perio-cols.json").read_text(encoding="utf-8"))

for c in COLS["cols"]:
    if c["fdi"] in (17, 27, 16, 26):
        print(c["fdi"], "x0", c["x0"], "x1", c["x1"], "cx", c.get("cx"))

async def main():
    from playwright.async_api import async_playwright
    svg = SRC.read_text(encoding="utf-8")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1400, "height": 800})
        html = "<html><body style='margin:0'>" + svg + "</body></html>"
        await pg.set_content(html)
        el = pg.locator("svg")
        await el.screenshot(path=r"F:\MAS-2\backend\scripts\_teeth_src_full.png")
        await b.close()

asyncio.run(main())
print("ok")
