# -*- coding: utf-8 -*-
# Routing-Beispiel fuer evening_briefing in Claras System-Prompt einfuegen.
import io, json, sys

PATH = r"F:\Clara-Voice\profiles\clara_meddent\profile.json"
with io.open(PATH, "r", encoding="utf-8-sig") as f:
    raw = f.read()
json.loads(raw)

anchor = "- 'Wie sieht der Tag der ganzen Praxis aus?' / 'Zeig mir alle Termine der Praxis.' -> day_briefing(doctorName='alle')."
addition = anchor + "\\n- 'Feierabend, Clara.' / 'Ich gehe jetzt, mach den Tagesabschluss.' / 'Was darf morgen nicht liegen bleiben?' -> evening_briefing (NICHT day_briefing, NICHT read_briefing)."

if "evening_briefing (NICHT day_briefing" in raw:
    print("already patched"); sys.exit(0)
if anchor not in raw:
    print("ANCHOR NOT FOUND"); sys.exit(1)
raw = raw.replace(anchor, addition, 1)
json.loads(raw)
with io.open(PATH, "w", encoding="utf-8", newline="") as f:
    f.write(raw)
print("OK")
