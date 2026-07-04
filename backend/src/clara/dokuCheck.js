import { chat } from "../mail/llm.js";
import { querschnittTreffer } from "./dokuPflicht.js";
import { effektiveAnforderungen, notiereBeobachtungen } from "./dokuLernen.js";

// ============================================================================
// Doku-Check (04.07.2026): prueft ein gesprochenes Behandlungsdiktat gegen die
// EFFEKTIVEN Doku-Anforderungen (Basis-Katalog +/− Lern-Profil der Praxis)
// und liefert Clara maximal DREI gezielte Rueckfragen zu echten Luecken.
//
// Arbeitsteilung wie bei Sophie (billingIntake): Das LLM entscheidet NUR,
// welche Felder im Diktat inhaltlich beantwortet sind — WAS gefragt wird,
// bestimmen die Kataloge (Daten), WIE gelernt wird, das Lern-Profil.
//
//   1. Feldliste aufbauen: Regel-Felder (− unterdrueckte) + Querschnitt-
//      Felder, wenn der Diktat-Text sie ausloest (z. B. "Roe 36" =>
//      rechtfertigende Indikation nach StrlSchG) + bei umfang "voll" die
//      universellen Geruest-Felder (Befund/Diagnose/Therapie/...).
//   2. LLM: vorhanden / fehlt / zusatz (Begriffe ohne Katalog-Feld).
//   3. zusatz -> Beobachtungen (dokuLernen): nennt der Chef eine Info-Art
//      wiederholt, schlaegt Clara EINMAL vor, sie als feste Frage zu lernen.
//
// Der Check ist IMMER best-effort: LLM tot/zu langsam => Diktat ist trotzdem
// gespeichert, es kommen nur keine Rueckfragen. Nie den Speicherweg blockieren.
// ============================================================================

const MAX_FRAGEN = 3;

/** Geruest-Felder, die bei vollem Umfang aus dem Diktat kommen muessen. */
const GERUEST_DIKTAT_PFLICHT = [
  { key: "befund", pflicht: true, frage: "Wie war der Befund?" },
  { key: "therapie", pflicht: true, frage: "Was genau wurde gemacht?" },
  { key: "komplikationen", pflicht: true, frage: "Gab es Komplikationen — oder ausdruecklich keine?" },
  { key: "procedere", pflicht: true, frage: "Wie geht es weiter — Kontrolle, Folgetermin, Verhaltensregeln?" },
];

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* weiter */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* weiter */ }
  }
  return null;
}

/**
 * Effektive Pruef-Feldliste fuer ein Diktat zusammenstellen.
 * Querschnitt-Felder ersetzen ein grobes regel-"roentgen"-Feld, wenn der
 * Trigger anschlaegt (feiner: Region/Indikation/Befund einzeln nachfragbar).
 */
export async function pruefFelder(clientId, specialtyKey, motiveName, text) {
  const eff = await effektiveAnforderungen(clientId, specialtyKey, motiveName);
  if (!eff.dokuPflichtig) return { eff, felder: [] };

  let felder = [...eff.felder];
  const quer = querschnittTreffer(text);
  if (quer.length) {
    // grobes Sammel-Feld "roentgen" raus, feine Querschnitt-Felder rein — und
    // zwar VORNE: rechtliche Pflichten (StrlSchG: rechtfertigende Indikation)
    // duerfen nie durch die Rueckfragen-Obergrenze verdraengt werden.
    felder = felder.filter((f) => f.key !== "roentgen");
    const querFelder = [];
    for (const q of quer) {
      for (const f of q.felder) {
        if (!eff.unterdrueckt.has(f.key) && !felder.some((x) => x.key === f.key) && !querFelder.some((x) => x.key === f.key)) {
          querFelder.push(f);
        }
      }
    }
    felder = [...querFelder, ...felder];
  }
  if (eff.umfang === "voll") {
    for (const g of GERUEST_DIKTAT_PFLICHT) {
      if (!eff.unterdrueckt.has(g.key) && !felder.some((x) => x.key === g.key)) felder.push(g);
    }
  }
  return { eff, felder };
}

/**
 * Diktat gegen die effektiven Anforderungen pruefen.
 *
 * @returns {Promise<{ok:boolean, dokuPflichtig:boolean, regelId:string,
 *   fragen:Array<{key:string, frage:string}>, zusatz:string[],
 *   lernVorschlag:null|{feldKey:string, anzahl:number}, reason?:string}>}
 */
export async function pruefeDoku(clientId, specialtyKey, { motiveName, text, timeoutMs = 12000 } = {}) {
  const diktat = String(text || "").trim();
  const leer = { ok: true, dokuPflichtig: false, regelId: "", fragen: [], zusatz: [], lernVorschlag: null };
  if (!diktat) return leer;

  const { eff, felder } = await pruefFelder(clientId, specialtyKey, motiveName, diktat);
  if (!eff.dokuPflichtig) return { ...leer, regelId: eff.regelId };
  if (!felder.length) return { ...leer, dokuPflichtig: true, regelId: eff.regelId };

  const pflicht = felder.filter((f) => f.pflicht);
  const zeile = (f) => `- ${f.key}: ${f.frage}`;

  // EXTRAKTION statt Urteil: Das Modell muss je Feld die TEXTSTELLE aus dem
  // Diktat liefern, die die Frage beantwortet — oder null. Kleine Modelle
  // (qwen3:4b) winken bei blossem vorhanden/fehlt alles durch; eine Belegstelle
  // koennen sie nicht erfinden, ohne dass es auffaellt.
  const messages = [
    {
      role: "system",
      content: [
        "Du extrahierst aus dem Behandlungsdiktat einer Arztpraxis, welche Angaben tatsaechlich DRINSTEHEN.",
        "Antworte AUSSCHLIESSLICH mit JSON, ohne Erklaerung, ohne Markdown.",
        "Schema: {\"felder\":{\"<key>\":\"Textstelle aus dem Diktat\"|null},\"zusatz\":[\"begriff\"]}",
        "Regeln:",
        "- JEDER Key aus der Feldliste kommt in \"felder\" vor.",
        "- Wert = die woertliche Textstelle des Diktats, die die Frage beantwortet (auch implizit oder verneint: 'keine Besonderheiten' beantwortet komplikationen; 'ohne Anaesthesie' beantwortet anaesthesie).",
        "- Steht dazu NICHTS im Diktat: null. NIEMALS raten, NIEMALS aus der Frage ableiten, NIEMALS Textstellen erfinden.",
        "- Die blosse Erwaehnung einer Massnahme beantwortet NICHT deren Details: 'Roentgenbild angefertigt' enthaelt weder Indikation noch Befund.",
        "- zusatz = 0 bis 3 Begriffe (je 1-3 Woerter, klein, z. B. 'zahnfarbe', 'raucherstatus') fuer fachliche DETAIL-Angaben im Diktat, die zu KEINEM Feld passen. Nicht die Behandlungsart selbst. Im Zweifel leer.",
      ].join("\n"),
    },
    // Few-Shot: zeigt exakt das gewuenschte Null-Verhalten bei fehlenden Angaben.
    {
      role: "user",
      content: [
        "FELDER:",
        "- zahn: Welcher Zahn (FDI)?",
        "- anaesthesie: Mit welcher Anaesthesie?",
        "- komplikationen: Gab es Komplikationen?",
        "",
        'DIKTAT: "Sechsunddreissig extrahiert, keine Besonderheiten, A2 als Farbe bestimmt."',
      ].join("\n"),
    },
    {
      role: "assistant",
      content: '{"felder":{"zahn":"Sechsunddreissig","anaesthesie":null,"komplikationen":"keine Besonderheiten"},"zusatz":["zahnfarbe"]}',
    },
    {
      role: "user",
      content: [
        `FELDER:\n${felder.map(zeile).join("\n")}`,
        `DIKTAT: "${diktat.slice(0, 900)}"`,
      ].join("\n\n"),
    },
  ];

  const res = await chat(messages, { temperature: 0, maxTokens: 400, timeoutMs });
  if (!res.ok) return { ...leer, dokuPflichtig: true, regelId: eff.regelId, ok: false, reason: res.reason };

  const parsed = extractJson(res.text);
  if (!parsed || !parsed.felder || typeof parsed.felder !== "object") {
    return { ...leer, dokuPflichtig: true, regelId: eff.regelId, ok: false, reason: "parse_failed" };
  }

  const beantwortet = (key) => {
    const v = parsed.felder[key];
    if (v == null) return false;
    const s = String(v).trim().toLowerCase();
    return s !== "" && s !== "null" && s !== "nein" && s !== "fehlt" && s !== "keine angabe";
  };
  const fragen = pflicht.filter((f) => !beantwortet(f.key)).slice(0, MAX_FRAGEN)
    .map((f) => ({ key: f.key, frage: f.frage }));

  const zusatz = (Array.isArray(parsed.zusatz) ? parsed.zusatz : [])
    .map((z) => String(z).trim().toLowerCase()).filter((z) => z && z.length <= 40).slice(0, 3);

  // Beobachtungen fuers Lernen zaehlen (best-effort, blockiert nie).
  let lernVorschlag = null;
  if (zusatz.length) {
    try {
      const { vorschlag } = await notiereBeobachtungen(clientId, specialtyKey, eff.regelId, zusatz);
      lernVorschlag = vorschlag;
    } catch { /* Lernen ist Komfort */ }
  }

  return { ok: true, dokuPflichtig: true, regelId: eff.regelId, fragen, zusatz, lernVorschlag };
}

/**
 * Gesprochener Nachsatz fuer Claras Bestaetigung: fehlende Pflichtangaben als
 * kurze Rueckfragen + ggf. EIN Lern-Vorschlag. Leerstring, wenn nichts fehlt.
 */
export function baueRueckfragenSatz(check) {
  if (!check || !check.dokuPflichtig) return "";
  const teile = [];
  if (check.fragen?.length) {
    const fs = check.fragen.map((f) => f.frage.replace(/\s+/g, " ").trim());
    teile.push(`Fuer die lueckenlose Doku fehlt noch: ${fs.join(" ")}`);
  }
  if (check.lernVorschlag?.feldKey) {
    const wort = check.lernVorschlag.feldKey.replace(/_/g, " ");
    teile.push(`Mir faellt auf: ${wort} nennen Sie hier regelmaessig — soll ich kuenftig standardmaessig danach fragen?`);
  }
  return teile.join(" ");
}
