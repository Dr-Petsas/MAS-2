// PlanR-Probe: Welcher Plan ist diese Datei? Das Modell entscheidet anhand des gelesenen Textes.
// Hier stehen nur der Auftrag und das Prüfen der Antwort; nichts wird gespeichert.

export const PROBE_ARTEN = ["hkp", "goz-anlage", "labor", "privat-ze", "implantation", "par", "kb", "kfo", "kons", "unbekannt"];

export const PROBE_EINORDNEN = `Du bekommst den gelesenen Text einer Datei aus einer Zahnarztpraxis und ihren Dateinamen. Ein Zahnarzt hat einen ganzen Behandlungsfall hochgeladen, jede Datei gehört zu genau einem Plan. Entscheide, welcher Plan es ist.

art ist genau einer dieser Werte:
- "hkp": Heil- und Kostenplan Zahnersatz der gesetzlichen Kasse (Befund, Regelversorgung, Therapieplanung, Festzuschuss, BEMA).
- "goz-anlage": Anlage zu einem Kassen-HKP mit den privaten GOZ-Leistungen für denselben Zahnersatz (gleichartige oder andersartige Versorgung, Mehrkosten).
- "labor": Kostenvoranschlag oder Beleg des zahntechnischen Labors (BEL II, BEB, Material) ohne zahnärztliches Honorar.
- "privat-ze": rein privater Kostenvoranschlag für Zahnersatz: Kronen, Brücken, Prothesen, auch Kronen auf vorhandenen Implantaten. Keine Kassenleistung.
- "implantation": privater Plan für die Implantatchirurgie: Implantat setzen, Knochenaufbau, Sinuslift, Freilegung (GOZ 9000 bis 9170).
- "par": Parodontitis-Behandlung: PAR-Status, antiinfektiöse Therapie, UPT, auch privat nach GOZ Abschnitt E.
- "kb": Kieferbruch, Kiefergelenk, Aufbissbehelf, Schienentherapie, Funktionsanalyse.
- "kfo": Kieferorthopädie: KIG, Multiband, Aligner, Behandlungsplan KFO.
- "kons": Füllungen, Inlays, Wurzelbehandlung, Mehrkostenvereinbarung für Füllungen.
- "unbekannt": nichts davon oder nicht zu entscheiden.

kasse ist true, wenn die gesetzliche Krankenkasse an diesem Plan beteiligt ist (BEMA, Festzuschuss, Kassenformular), sonst false.
grund nennt in höchstens zwölf Wörtern, woran du es erkannt hast. Keine Namen, keine Geburtsdaten.

Antworte nur mit JSON: {"art":"...","kasse":true,"grund":"..."}. Kein Markdown.`;

/** Antwort des Modells prüfen. Ungültiges wird zu null, damit die Seite auf ihre eigene Zuordnung zurückfällt. */
export function einordnungLesen(rohText) {
  const roh = String(rohText || "");
  const nachDenken = roh.lastIndexOf("</think>");
  const kern = nachDenken >= 0 ? roh.slice(nachDenken + 8) : roh;
  const start = kern.indexOf("{");
  const ende = kern.lastIndexOf("}");
  if (start < 0 || ende <= start) return null;
  let daten = null;
  try { daten = JSON.parse(kern.slice(start, ende + 1)); } catch { return null; }
  if (!daten || typeof daten !== "object") return null;
  const art = String(daten.art || "").trim().toLowerCase();
  if (!PROBE_ARTEN.includes(art)) return null;
  return {
    art: art === "unbekannt" ? "" : art,
    kasse: daten.kasse === true,
    grund: String(daten.grund || "").trim().slice(0, 200),
  };
}
