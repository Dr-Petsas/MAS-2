# Lena — Sprachkommandos für Zahnbefunde (STT)

Quelle der Wahrheit: `backend/public/m/lena-zahnstatus-katalog.js`
(`SPEECH` = Regex-Regeln, `SPEECH_EXAMPLES` = geprüfte Beispielphrasen).

Parser läuft auf **ASCII-gefaltetem** Text (`ä→ae`, `ü→ue`, …). Regeln treffen
Umlaut- und ASCII-Form. Reihenfolge = Priorität (spezifisch vor generisch).

**Speed:** ~45 lineare Regexes pro Äußerung (eine je Code-Familie), keine
verschachtelten Quantoren. Kurz-Codes wie `ab`/`so`/`se` nur direkt nach
Zahnnummer (sonst Alltagsdeutsch).

**Massen-Scopes** (ohne Einzelzahn): `lena-voice-chart.js` → `massArchEvents`
(alle Achter / Weisheitszähne / OK / UK / zahnlos → `f` oder `e`).

---

## Status / Extraktion

| Code | Bedeutung | Sprachvarianten (Beispiele) |
|------|-----------|-----------------------------|
| `f` | fehlender Zahn | fehlt, fehlend, fehlen, nicht vorhanden, nicht angelegt, wurde gezogen, bereits gezogen |
| `e` | ersetzt | ersetzt, ersetzter Zahn, Prothesenzahn, Kunststoffzahn |
| `ew` | Ersatz erneuerungsbedürftig | erneuerungsbedürftiger Ersatz, Ersatz erneuern |
| `x` | nicht erhaltungswürdig | nicht erhaltungswürdig, Extraktion, extraktionswürdig, muss raus, muss extrahiert werden |
| `ww` | weitgehend zerstört | weitgehend zerstört, stark zerstört, behandlungsbedürftig, destruier… |
| `pw` | partieller Substanzdefekt | partieller Substanzdefekt, Substanzdefekt, kleiner Defekt |
| `ur` | unzureichende Retention | unzureichende Retention, Retention unzureichend, hält nicht |
| `)(` | Lückenschluss | Lückenschluss, Lücke geschlossen |

### Massen (viele Zähne auf einmal)

| Scope | Varianten | Code |
|-------|-----------|------|
| Alle Zähne | alle Zähne fehlend/fehlen, zahnlos, unbezahnt | `f` |
| OK / UK | alle OK/UK Zähne fehlen, Oberkiefer/Unterkiefer zahnlos | `f` |
| OK / UK Ersatz | alle OK/UK Zähne ersetzt, Oberkiefer ersetzt | `e` |
| Achter | alle Achter fehlen, alle Weisheitszähne fehlen, alle 8er fehlen | `f` (18/28/38/48) |

---

## Krone / Teleskop / Teilkrone

| Code | Bedeutung | Sprachvarianten |
|------|-----------|-----------------|
| `k` | Krone | Krone, Metallkeramik, Vollkeramik, Zirkon(oxid)krone, überkron…, crown, km / ka em |
| `kw` | Krone erneuerungsbedürftig | erneuerungsbedürftige Krone, Krone erneuern, Krone defekt |
| `pkw` | Teilkrone | Teilkrone, tk, tee ka, t k |
| `t` | Teleskop | Teleskop, Teleskopkrone, Telesco…, freistesendes `t` |
| `tw` | Teleskop erneuerungsbedürftig | erneuerungsbedürftige Teleskop, Teleskop erneuern |
| `t2w` | Sekundärteil defekt | Sekundärteil |

---

## Brücke / Adhäsiv

| Code | Bedeutung | Sprachvarianten |
|------|-----------|-----------------|
| `b` | Brückenglied | Brücke, Brückenglied, Pontic |
| `bw` | Brückenglied erneuerungsbedürftig | erneuerungsbedürftiges Brückenglied |
| `a` | Adhäsiv-Anker | Adhäsivbrücke, Adhäsivanker |
| `ab` | Adhäsiv-Glied | Adhäsivbrücke Glied, Marylandbrücke, Klebebrücke |
| `aw` / `abw` | Adhäsiv erneuerungsbedürftig | … erneuern / erneuerungsbedürftig… |

---

## Implantat

| Code | Bedeutung | Sprachvarianten |
|------|-----------|-----------------|
| `sk` | Implantat(krone) | Implantat, Implantatkrone |
| `skw` | Implantatkrone erneuerungsbedürftig | erneuerungsbedürftige Implantatkrone, Implantatkrone erneuern |
| `st` / `stw` | Implantat-Teleskop | Implantat-Teleskop (+ erneuern) |
| `sb` / `sbw` | Implantat-Brückenglied | Implantat-Brückenglied / -Pontic (+ erneuern) |
| `se` / `sew` | Implantat-Prothesenersatz | Implantatprothese, Implantat-Ersatz (+ erneuern) |
| `so` / `sow` | Verbindungselement | Locator, Kugelkopf, Verbindungselement, Stegelement (+ erneuern) |
| `ix` | Implantat entfernen | Implantat entfernen/raus, zu entfernendes Implantat |

---

## Wurzelstift / Lage / Klinik

| Code | Bedeutung | Sprachvarianten |
|------|-----------|-----------------|
| `r` / `rw` | Wurzelstiftkappe | Wurzelstiftkappe, Stiftkappe (+ erneuerungsbedürftig) |
| `rt` | retiniert | retiniert, nicht durchgebrochen |
| `imp` | impaktiert | impaktiert, im Knochen liegend/steckt |
| `verl` | verlagert | verlagert |
| `Ka` → Schema `c` | Karies | Karies, kariös, initiale Karies |
| `Fu` → Schema `f`+Flächen | Füllung | Füllung, Komposit, Inlay, Onlay, Amalgam |
| `WF` | Wurzelfüllung | Wurzelfüllung, Guttapercha, Stiftaufbau |
| `LA` | Anästhesie | Anästhesie, Leitungs-/Infiltrationsanästhesie, Ultracain, Ubistesin, Xylocain |
| `Paro` | Parodontal | Parodont, Sondiertiefen, BOP, Blutung auf Sondieren |
| `Kief` | Kiefer/CMD | Kiefergelenk, CMD, Myalgie, Knacken im Gelenk |

---

## Flächen (BMV-Z)

| Code | Varianten |
|------|-----------|
| `m` | mesial |
| `o` | okklusal, inzisal |
| `d` | distal |
| `v` | vestibulär, bukkal, labial |
| `l` | lingual, palatinal, oral |
| `z` | zervikal, Hals |

---

## Bewusst nicht als Freitext

| Token | Grund |
|-------|--------|
| `ab`, `so`, `se` | Alltagsdeutsch → nur nach Zahnnummer (`16 ab`) |
| alleiniges `r`, `a` | zu mehrdeutig |
| `ersetzen` (Infinitiv) | Therapie-Plan, nicht Befund `e` |
| `Fehler` / `empfehlen` | kein `f` (Wortgrenze) |
