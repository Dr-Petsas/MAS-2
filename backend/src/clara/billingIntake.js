// Verständnis-Schicht für Sophies Abrechnung: wandelt die Kurzschrift/das Diktat
// eines Zahnarztes ("37 vit E med", "x 46 ost naht", "ZE fix 26", "Leitung links")
// in eine strukturierte Liste von Behandlungsabsichten { konzept, attrs }.
//
// WICHTIG (Architektur/Geniestreich): Das LLM bestimmt NUR Konzept + Attribute,
// niemals Abrechnungsziffern. GOZ/BEMA, Mengen (Kanäle/Flächen) und Regeln
// berechnet die deterministische Sophie-Engine im Frontend. Konzept-Vokabular
// und Abkürzungs-Glossar kommen als `katalog` aus dem Frontend (eine Quelle der
// Wahrheit). Bei LLM-Ausfall liefert das Frontend selbst einen deterministischen
// Parser-Fallback — daher geben wir hier bei Problemen schlicht ok:false zurück.

import { chat } from "../mail/llm.js";

function buildKonzeptListe(konzepte) {
  if (!Array.isArray(konzepte)) return "";
  return konzepte
    .map((k) => {
      const attrs = Array.isArray(k.attribute)
        ? k.attribute
            .map((a) => {
              const opt = Array.isArray(a.optionen) && a.optionen.length
                ? `=${a.optionen.map((o) => o.value).join("|")}`
                : "";
              return `${a.key}(${a.typ}${opt})${a.pflicht ? "*" : ""}`;
            })
            .join(", ")
        : "";
      return `- ${k.id} — ${k.label}${k.fachbereich ? ` [${k.fachbereich}]` : ""}: ${attrs}`;
    })
    .join("\n");
}

/**
 * Baut Few-Shot-Dialogpaare aus den mitgeschickten Korpus-Beispielen.
 * Robust: nur valide Konzepte, gedeckelt, fehlertolerant. Liefert [] wenn nichts da.
 */
function fewShotMessages(beispiele, erlaubteIds) {
  if (!Array.isArray(beispiele) || !beispiele.length) return [];
  const MAX = 4;
  const out = [];
  for (const b of beispiele.slice(0, MAX)) {
    const diktat = String(b?.diktat || "").trim();
    if (!diktat) continue;
    const absichten = (Array.isArray(b?.absichten) ? b.absichten : [])
      .map((a) => ({ konzept: String(a?.konzept || "").trim(), attrs: a?.attrs && typeof a.attrs === "object" ? a.attrs : {} }))
      .filter((a) => a.konzept && (!erlaubteIds || erlaubteIds.size === 0 || erlaubteIds.has(a.konzept)));
    if (!absichten.length) continue;
    const bz = String(b?.zahn || "").trim();
    out.push({ role: "user", content: `Kontext-Zahn: ${bz || "—"}\nEingabe: ${diktat}` });
    out.push({ role: "assistant", content: JSON.stringify({ absichten, unbekannt: [] }) });
  }
  return out;
}

function systemPrompt(katalog) {
  const konzepte = buildKonzeptListe(katalog?.konzepte);
  const glossar = String(katalog?.glossar || "").slice(0, 9000);
  return [
    "Du bist die Verstaendnis-Schicht von Sophie, der Zahnarzt-Abrechnungsassistentin.",
    "Wandle die Kurzschrift / das Diktat eines Zahnarztes in eine JSON-Liste von Behandlungsabsichten um.",
    "",
    "REGELN:",
    "- Antworte AUSSCHLIESSLICH mit JSON. Kein Fließtext, keine Erklärung, kein Markdown, keine ```-Blöcke.",
    "- Du bestimmst NUR `konzept` + `attrs`. Erfinde KEINE GOZ/BEMA-Ziffern und keine Punktzahlen — die berechnet Sophie deterministisch.",
    "- Verwende ausschließlich die unten erlaubten konzept-IDs und Attribut-Schlüssel. Was du nicht zuordnen kannst, kommt als String in \"unbekannt\".",
    "- Zahnnummern in FDI (z. B. 36, 11, 48). Flächen als Buchstaben m,o,d,b,l,p (z. B. \"mod\").",
    "- Wurzel-/Kanalzahl NIE angeben — Sophie leitet sie aus dem Zahn ab.",
    "- Mehrere Behandlungen ⇒ mehrere Einträge. Übernimm den zuletzt genannten Zahn als Kontext, wenn er nicht erneut genannt wird.",
    "- Setze nur Attribute, die eindeutig aus der Eingabe hervorgehen. Lass Unklares weg (Sophie fragt nach).",
    "- EINE Füllung an EINEM Zahn = GENAU EINE Absicht. Niemals pro Fläche, Diagnose oder Begleitmaßnahme aufteilen.",
    "- `flaechen` enthält NUR zusammengeschriebene Flächenbuchstaben m,o,d,b,l,p,i,v (z. B. \"modb\"). F1–F4 nennen nur die Flächenzahl (F4 = vierflächig) — KEINE eigene Absicht, KEIN flaechen-Wert.",
    "- MKV (Mehrkostenvereinbarung) und CP (caries profunda) sind KEINE Flächen und KEINE eigenen Behandlungen: MKV = Einwilligung, CP = Diagnose/Begründung. Niemals als `flaechen` oder als zusätzliche Füllung ausgeben.",
    "- \"x\" / \"ex\" bedeutet EXTRAKTION (Zahn entfernen) → konzept \"extraktion\". NIEMALS eine Füllung, NIEMALS eine Fläche. Eine Ziffer hinter dem \"x\" (x1, x2, x3) gehört zur Extraktion und ist KEINE Flächenzahl und KEINE Flächenangabe.",
    "- Ein direkt am Zahn KLEBENDES Kürzel gilt für genau diesen Zahn: \"36x\"/\"36x3\" = Extraktion an 36; \"16wf\" = Wurzelfüllung an 16; \"26mod\" = Füllung mod an 26. Trenne die Zahnnummer (zweistellig, FDI) immer vom Kürzel.",
    "- Ein tief zerstörter / nicht erhaltungswürdiger Zahn wird EXTRAHIERT, nicht gefüllt.",
    "- \"inz\" ist MEHRDEUTIG und MUSS aus dem Kontext entschieden werden: (a) Abszess/Eiter/Schwellung/Schmerz/Streifen/Drainage → INZISION eines Abszesses → konzept \"inzision\"; (b) Füllungskontext/Komposit/CP/weitere Flächenbuchstaben (z. B. \"26 mod inz\") → Füllungsfläche inzisal → flaechen-Buchstabe \"i\" (an die Füllung, KEINE eigene Behandlung). \"inz1\"/\"inz2\" (mit Ziffer) sind IMMER die BEMA-Inzision (konzept \"inzision\").",
    "- Ist der Kontext bei \"inz\" NICHT eindeutig (oder beides denkbar): NICHT raten. Lege das Wort in \"unbekannt\" ab — Sophie fragt dann gezielt nach (Inzision oder Fläche inzisal?).",
    "- \"streifen\" / \"streifeneinlage\" / \"drainage\" ist im Inzisionskontext die Drainage NACH der Inzision und gehört zur selben \"inzision\"-Behandlung — keine eigene Füllung.",
    "- \"med\" / \"einlage\" (medikamentöse Einlage): ZUSAMMEN mit WK/Trepanation/Wurzelfüllung/Vitalexstirpation → KEINE eigene Absicht, sondern attrs.sitzungen=\"mehrzeitig\" an der \"endo\"-Absicht. ALLEIN (Folgetermin, z. B. \"nur ne med gemacht\") → eigenes konzept \"medeinlage\" (nur die Einlage). Ist KEIN Zahn genannt, lass \"zahn\" weg — Sophie leitet ihn aus der offenen Wurzelbehandlung ab und fragt bestätigend nach.",
    "- Begleitmaßnahmen (Kofferdam, Blutstillung, Retraktionsfäden, parapulpärer Stift, Naht) gehören zur selben Behandlung. Fehlt ein passendes Attribut/Konzept, liste sie in \"unbekannt\" — niemals als zusätzliche Füllung/Zahnersatz.",
    "- IMPLANTAT-AUGMENTATION: Sinuslift, Knochenaufbau, Knochenentnahme, Membran/Titangitter und Eigenblut/PRF/PRP sind KEINE eigenen Behandlungen und NICHT \"unbekannt\" — sie sind ATTRIBUTE der \"implantat\"-Absicht. Setze: augmentation=\"ja\" sobald Knochenaufbau/Augmentation/Sinuslift/Eigenknochen genannt ist; sinuslift=\"extern\" (lateral/offen) bzw. \"intern\" (transkrestal/geschlossen) — bei bloßem \"SL\"/\"Sinuslift\" ohne Typ lass sinuslift WEG (Sophie fragt); knochenherkunft=\"eigenknochen\" (Eigenknochen/Knochenblock/Entnahme aus UK/retromolar), \"beides\" (Eigenknochen + Ersatzmaterial) oder \"ersatzmaterial\"; membran=\"titanmesh\" (Titangitter/Titanmesh/Mesh/OssBuilder/vertikaler Aufbau) bzw. \"kollagen\" (Kollagen-/Barrieremembran); prf=\"ja\" (PRP/PRF/Fibrinmembran/Eigenblut).",
    "- Bei mehreren Implantaten in EINER Region (z. B. \"impl an 24 und 26\"): gib je Implantat eine \"implantat\"-Absicht aus (attrs.zahn 24 bzw. 26) und setze die Augmentations-Attribute (augmentation/sinuslift/knochenherkunft/membran/prf) an JEDER dieser Absichten, wenn der Aufbau die Region betrifft.",
    "- Nenne der Behandler nur einen Teil der Details (z. B. \"Knochenaufbau\" ohne Membran-Typ), setze NUR die genannten Attribute und lass die übrigen WEG — Sophie fragt den Rest gezielt nach. Rate nicht.",
    "",
    "ERLAUBTE KONZEPTE (id — Label: attribut(typ=optionen)*=Pflicht):",
    konzepte,
    "",
    "ABKÜRZUNGS-GLOSSAR (Praxis-Kurzschrift → Bedeutung [Ziel]):",
    glossar,
    "",
    "- Sind weiter oben bereits gelöste BEISPIEL-Fälle (Eingabe → JSON) gezeigt, sind das KORRIGIERTE Referenzfälle dieser Praxis: übernimm deren Schreibweisen/Zuordnungen als Vorbild, wenn die aktuelle Eingabe ähnlich ist.",
    "ANTWORTFORMAT (exakt dieses Schema):",
    '{"absichten":[{"konzept":"<id>","attrs":{"zahn":"36"}}],"unbekannt":[]}',
  ].join("\n");
}

function extractJson(text) {
  if (!text) return null;
  // erst sauberes Parsen versuchen, sonst erstes {...}-Objekt herausschneiden
  try { return JSON.parse(text); } catch { /* weiter */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* weiter */ }
  }
  return null;
}

/**
 * Few-Shot (Schritt 4): `beispiele` sind die ähnlichsten KORRIGIERTEN Fälle aus dem
 * Korrektur-Korpus (das Frontend wählt sie aus). Sie werden als echte Dialogpaare
 * (Eingabe → exakte JSON-Soll-Antwort) VOR die eigentliche Eingabe gehängt — so
 * lernt das Modell die Praxis-Mappings zur Laufzeit, ohne Neutraining.
 *
 * @param {{ text:string, zahn?:string, katalog?:any, beispiele?:Array<{diktat:string, zahn?:string, absichten:Array<{konzept:string, attrs?:Record<string,string>}>}> }} args
 * @returns {Promise<{ok:boolean, absichten:Array<{konzept:string, attrs:Record<string,string>}>, unbekannt:string[], model?:string, reason?:string}>}
 */
export async function intakeToAbsichten({ text, zahn, katalog, beispiele }) {
  const eingabe = String(text || "").trim();
  if (!eingabe) return { ok: false, reason: "empty", absichten: [], unbekannt: [] };

  const erlaubteIds = new Set((katalog?.konzepte || []).map((k) => k.id));
  const attrKeys = new Map(
    (katalog?.konzepte || []).map((k) => [k.id, new Set([...(k.attribute || []).map((a) => a.key), "zahn"])]),
  );

  const messages = [
    { role: "system", content: systemPrompt(katalog) },
    ...fewShotMessages(beispiele, erlaubteIds),
    { role: "user", content: `Kontext-Zahn: ${zahn || "—"}\nEingabe: ${eingabe}` },
  ];

  const res = await chat(messages, { temperature: 0.1, maxTokens: 500, timeoutMs: 30000 });
  if (!res.ok) return { ok: false, reason: res.reason || "llm_error", absichten: [], unbekannt: [] };

  const parsed = extractJson(res.text);
  if (!parsed || !Array.isArray(parsed.absichten)) {
    return { ok: false, reason: "parse_failed", absichten: [], unbekannt: [], model: res.model };
  }

  const absichten = [];
  const unbekannt = Array.isArray(parsed.unbekannt) ? parsed.unbekannt.map((u) => String(u)).filter(Boolean) : [];
  for (const a of parsed.absichten) {
    const id = String(a?.konzept || "").trim();
    if (!erlaubteIds.has(id)) { if (id) unbekannt.push(id); continue; }
    const erlaubt = attrKeys.get(id) || new Set(["zahn"]);
    const attrs = {};
    for (const [k, v] of Object.entries(a?.attrs || {})) {
      if (erlaubt.has(k) && v != null && String(v).trim() !== "") attrs[k] = String(v).trim();
    }
    absichten.push({ konzept: id, attrs });
  }

  return { ok: true, absichten, unbekannt, model: res.model };
}
