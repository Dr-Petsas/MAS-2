# -*- coding: utf-8 -*-
# Fuegt Claras Profil das evening_briefing-Tool hinzu und entfernt die
# Umsatz-Erwaehnung aus der morning_briefing-Beschreibung (String-Patch,
# damit die JSON-Formatierung der Datei unangetastet bleibt).
import io, json, sys

PATH = r"F:\Clara-Voice\profiles\clara_meddent\profile.json"

with io.open(PATH, "r", encoding="utf-8-sig") as f:
    raw = f.read()

# Sanity: gueltiges JSON vor dem Patch
json.loads(raw)

changed = 0

old_desc = "EIN fluessiges Komplett-Briefing aus Tagesplan, ueber Nacht eingegangenen Anrufen/E-Mails, offenen Anliegen und dem Luecken-Radar mit Umsatzschaetzung."
new_desc = "EIN fluessiges Komplett-Briefing: kritische Punkte ZUERST (Anwaltsschreiben, Kammer, Mahnungen, Fristen), dann Tagesplan, ueber Nacht eingegangene Anrufe/E-Mails, offene Anliegen und das Luecken-Radar (OHNE Umsatzzahlen)."
if old_desc in raw:
    raw = raw.replace(old_desc, new_desc, 1)
    changed += 1

anchor = '"url": "http://127.0.0.1:4000/tools/morning-briefing?clientId=MEe4ZQHEzOPzLcexyhdT",\n      "method": "POST",\n      "enabled": true,\n      "params": [],\n      "speak_result": "verbatim"\n    },'
evening_block = anchor + '''
    {
      "name": "evening_briefing",
      "description": "Der ABEND-MOMENT (Tagesabschluss): betont NUR dringende Aufgaben fuer morgen - rote Liste (Anwaltsschreiben, Kammer/Behoerde, Mahnungen, Pfaendungen, Fristen), stressende oder ungeloeste Patienten von heute und offene Freigaben. KEINE Statistik, KEINE Zahlenkolonnen. Nutze dies, wenn der Chef sich VERABSCHIEDET oder den Tagesabschluss will: 'Feierabend, Clara', 'Ich gehe jetzt', 'Mach den Tagesabschluss', 'Was darf morgen nicht liegen bleiben?', 'Abendbriefing'. NICHT bei Fragen nach heutigen Terminen (day_briefing), Anrufen (call_log) oder dem grossen Vorgangs-Briefing (read_briefing). Lies die zurueckgegebene Nachricht vollstaendig vor.",
      "url": "http://127.0.0.1:4000/tools/evening-briefing?clientId=MEe4ZQHEzOPzLcexyhdT",
      "method": "POST",
      "enabled": true,
      "params": [],
      "speak_result": "verbatim"
    },'''

if '"name": "evening_briefing"' not in raw:
    if anchor.replace("\n", "\r\n") in raw:
        raw = raw.replace(anchor.replace("\n", "\r\n"), evening_block.replace("\n", "\r\n"), 1)
        changed += 1
    elif anchor in raw:
        raw = raw.replace(anchor, evening_block, 1)
        changed += 1
    else:
        print("ANCHOR NOT FOUND"); sys.exit(1)

# Validieren und schreiben
json.loads(raw)
with io.open(PATH, "w", encoding="utf-8", newline="") as f:
    f.write(raw)
print("OK, changes:", changed)
