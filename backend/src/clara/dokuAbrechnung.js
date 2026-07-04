import { chat } from "../mail/llm.js";
import { masCollection } from "../tenant.js";
import { sophieBill } from "./sophieBilling.js";

// ============================================================================
// Gemischte Sprachmemos: Doku UND Abrechnung in einem Atemzug (04.07.2026)
// ============================================================================
// Aerzte diktieren beides zusammen: "Zahn 36 Fuellung zweiflaechig Composite,
// Infiltration, keine Besonderheiten. Berechne das privat mit Faktor 3,5."
// Dieses Modul trennt das sauber und haelt BEIDE Spuren am Laufen:
//
//   1. trenneMemo():   PURE Abrechnungsanweisungen (Ziffern, Faktor, privat/
//      Kasse, "berechne ...") werden aus dem Memo herausgeloest. Alles
//      Klinische bleibt in der Doku — auch wenn es fuer die Abrechnung
//      nuetzlich ist (Flaechen, Anaesthesie ...), denn die Abrechnung liest
//      den klinischen Text ohnehin mit. In die Kartei gehoeren KEINE
//      Abrechnungskommandos (§ 630f: Behandlungsdoku, keine Rechnungsnotizen).
//
//   2. mas_abrechnung_memo/{appointmentId}: Abrechnungs-Hinweise werden pro
//      Termin KUMULIERT gemerkt (Arbeitsstand), zusammen mit dem letzten
//      Sophie-Status. So gehen Angaben wie "Faktor 3,5" nicht verloren, bis
//      tatsaechlich abgerechnet wird.
//
//   3. pruefeAbrechnung(): Nach jedem Memo laeuft die Sophie-Engine still
//      (quiet: kein Gedaechtnis-Eintrag, keine Persistenz) ueber klinischen
//      Text + Hinweise. Fehlt eine Angabe, kommt die Gegenfrage in Claras
//      Bestaetigung — und zwar bei JEDEM weiteren Memo erneut, bis sie
//      beantwortet ist. Fragen duerfen nicht vergessen werden: beide Spuren
//      werden pro Turn aus dem GESAMTstand neu berechnet, nicht aus dem
//      Gespraechsverlauf "erinnert".
// ============================================================================

const MEMO_COLLECTION = "mas_abrechnung_memo";

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

function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// Offensichtliche Abrechnungs-Sprache (Fallback ohne LLM + Plausibilitaets-
// Anker): nur Begriffe, die klinisch praktisch nie vorkommen.
const ABRECHNUNG_MARKER = /\b(berechn\w*|abrechn\w*|rechne\s+(das|den|die|es)?\s*ab|setz\w*\s+an|angesetzt|goz|bema|faktor\s+\d|steigerungsfaktor|privatleistung|privatrechnung|ziffer\w*|gebuehr\w*|geb[uü]hr\w*|rechnung|kostenvoranschlag|heil-?\s*und\s*kostenplan|hkp)\b/i;

/** Satzweise Fallback-Trennung, wenn das LLM nicht antwortet. */
function trenneFallback(memo) {
  const saetze = String(memo).split(/(?<=[.!?])\s+/);
  const doku = [];
  const abrechnung = [];
  for (const s of saetze) {
    if (ABRECHNUNG_MARKER.test(s)) abrechnung.push(s.trim());
    else doku.push(s.trim());
  }
  return {
    dokuText: doku.join(" ").trim(),
    abrechnungText: abrechnung.join(" ").trim(),
    methode: "fallback",
  };
}

/**
 * Memo in Doku-Text und PURE Abrechnungsanweisungen trennen.
 *
 * Sicherheitsnetz gegen Klinik-Verlust: Das LLM benennt nur die Abrechnungs-
 * Passagen (woertlich); entfernt wird ausschliesslich, was sich woertlich im
 * Memo wiederfindet UND nach Abrechnung aussieht (Marker-Check). Im Zweifel
 * bleibt der Satz in der Doku — doppelt schadet nicht (die Abrechnung liest
 * den klinischen Text sowieso), verlorene Klinik-Doku schon.
 *
 * @param {string} memo woertliches Sprachmemo
 * @param {{offeneAbrechnungsFrage?:string, timeoutMs?:number}} opts
 * @returns {Promise<{dokuText:string, abrechnungText:string, methode:string}>}
 */
export async function trenneMemo(memo, { offeneAbrechnungsFrage = "", timeoutMs = 8000 } = {}) {
  const text = String(memo || "").trim();
  if (!text) return { dokuText: "", abrechnungText: "", methode: "leer" };

  // Kurzschluss: kein Abrechnungs-Marker weit und breit -> alles Doku, kein
  // LLM-Aufruf (spart 2-5 s bei der haeufigsten Sorte Memo). Ausnahme: es ist
  // eine Abrechnungsfrage offen — dann kann auch ein markerloser Kurzsatz
  // ("drei Kanaele") die Antwort darauf sein, das soll das LLM entscheiden.
  if (!ABRECHNUNG_MARKER.test(text) && !offeneAbrechnungsFrage) {
    return { dokuText: text, abrechnungText: "", methode: "kein_marker" };
  }

  const messages = [
    {
      role: "system",
      content: [
        "Du sortierst das Sprachmemo eines Arztes. Es kann Behandlungsdokumentation UND Abrechnungsanweisungen enthalten.",
        "Antworte NUR mit JSON: {\"abrechnung\":[\"woertliche Passage\", ...]}",
        "In \"abrechnung\" gehoeren NUR Passagen, deren Zweck die ABRECHNUNG ist: Gebuehrenziffern, Steigerungsfaktor, privat/Kasse-Zuordnung, 'berechne/setze an/rechne ab', Rechnungs- oder Kostenhinweise" + (offeneAbrechnungsFrage ? ", sowie die direkte Antwort auf die unten genannte offene Abrechnungsfrage" : "") + ".",
        "NICHT hinein gehoeren klinische Fakten: Befund, Diagnose, Therapie, Zaehne, Flaechen, Materialien, Anaesthesie, Komplikationen, Procedere — auch wenn sie fuer die Abrechnung nuetzlich sind.",
        "Passagen WOERTLICH aus dem Memo kopieren, NICHTS umformulieren, NICHTS erfinden.",
        "Ist nichts Abrechnungs-spezifisches drin: leere Liste.",
      ].join("\n"),
    },
    {
      role: "user",
      content: 'MEMO: "Zahn 36 Fuellung zweiflaechig okklusal-distal mit Composite, Infiltration, keine Besonderheiten. Berechne das privat mit Faktor 3,5."',
    },
    { role: "assistant", content: '{"abrechnung":["Berechne das privat mit Faktor 3,5."]}' },
    {
      role: "user",
      content: 'MEMO: "PZR gemacht, achtundzwanzig Zaehne, Zahnfleisch reizlos, naechste Kontrolle in sechs Monaten."',
    },
    { role: "assistant", content: '{"abrechnung":[]}' },
    {
      role: "user",
      content: [
        offeneAbrechnungsFrage ? `OFFENE ABRECHNUNGSFRAGE: "${offeneAbrechnungsFrage}"` : "",
        `MEMO: "${text.slice(0, 1200)}"`,
      ].filter(Boolean).join("\n"),
    },
  ];

  const res = await chat(messages, { temperature: 0, maxTokens: 200, timeoutMs });
  if (!res.ok) return trenneFallback(text);

  const parsed = extractJson(res.text);
  if (!parsed || !Array.isArray(parsed.abrechnung)) return trenneFallback(text);

  let doku = text;
  const abrechnung = [];
  for (const roh of parsed.abrechnung) {
    const passage = norm(roh);
    if (!passage) continue;
    // Nur entfernen, was (a) woertlich im Memo steht und (b) nach Abrechnung
    // aussieht ODER eine offene Abrechnungsfrage beantwortet. Sonst: Doku behalten.
    const idx = doku.toLowerCase().indexOf(passage.toLowerCase());
    const plausibel = ABRECHNUNG_MARKER.test(passage) || !!offeneAbrechnungsFrage;
    if (idx >= 0 && plausibel) {
      doku = (doku.slice(0, idx) + " " + doku.slice(idx + passage.length)).replace(/\s{2,}/g, " ").trim();
      abrechnung.push(passage);
    } else if (plausibel && ABRECHNUNG_MARKER.test(passage)) {
      // nicht woertlich gefunden (STT-Abweichung): mitnehmen, Doku unangetastet
      abrechnung.push(passage);
    }
  }

  doku = doku.replace(/^[\s.,;:—-]+|[\s,;:—-]+$/g, "").trim();
  // Klinik-Schutz: Wenn nach dem Herausloesen nichts Brauchbares uebrig ist,
  // das Memo aber nicht NUR aus den Abrechnungspassagen bestand, alles behalten.
  const abrechnungGesamt = abrechnung.join(" ");
  if (!doku && abrechnungGesamt.length < text.length * 0.6) {
    return { dokuText: text, abrechnungText: abrechnungGesamt, methode: "llm_schutz" };
  }
  return { dokuText: doku, abrechnungText: abrechnungGesamt, methode: "llm" };
}

// --- Abrechnungs-Gedaechtnis pro Termin -------------------------------------

function memoRef(clientId, appointmentId) {
  return masCollection(clientId, MEMO_COLLECTION).doc(String(appointmentId));
}

/** Gespeicherten Abrechnungs-Arbeitsstand eines Termins lesen (oder leer). */
export async function getAbrechnungsMemo(clientId, appointmentId) {
  if (!appointmentId) return { hinweise: "", lastStatus: "", lastFrage: "", lastLabel: "" };
  try {
    const snap = await memoRef(clientId, appointmentId).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    return {
      hinweise: String(d.hinweise || ""),
      lastStatus: String(d.lastStatus || ""),
      lastFrage: String(d.lastFrage || ""),
      lastLabel: String(d.lastLabel || ""),
    };
  } catch {
    return { hinweise: "", lastStatus: "", lastFrage: "", lastLabel: "" };
  }
}

/** Abrechnungs-Hinweis zum Termin dazuschreiben (kumuliert). */
export async function appendAbrechnungsHinweis(clientId, appointmentId, { text, patientId = "", lastName = "" } = {}) {
  const zusatz = norm(text);
  if (!appointmentId || !zusatz) return;
  const alt = await getAbrechnungsMemo(clientId, appointmentId);
  const hinweise = alt.hinweise ? `${alt.hinweise} ${zusatz}`.slice(0, 2000) : zusatz.slice(0, 2000);
  await memoRef(clientId, appointmentId).set({
    hinweise,
    patientId: patientId || null,
    lastName: lastName || null,
    updatedAtMs: Date.now(),
  }, { merge: true });
}

// --- Slot-Fuellung: Sophies Gegenfragen aus dem Text selbst beantworten -----
// Die Strecken-Engine (CF) versteht Freitext NICHT ("zweiflaechig" fuellt den
// Slot flaechen nicht) — ohne diese Schicht wiederholte Sophie ihre Frage
// endlos, egal was der Chef antwortet. Deshalb: Gegenfrage + Optionen kommen
// aus der CF zurueck (frageDetail), MAS extrahiert die Antwort aus dem bereits
// diktierten Text (erst deterministisch, dann lokales LLM) und fragt die CF
// erneut. Nur Fragen, die der Text WIRKLICH nicht beantwortet, erreichen den
// Chef.

const WORTZAHL = { ein: "1", eine: "1", einen: "1", zwei: "2", drei: "3", vier: "4", fuenf: "5", sechs: "6", sieben: "7", acht: "8", neun: "9", zehn: "10", elf: "11", zwoelf: "12" };

function normZahlwoerter(s) {
  return String(s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\b(ein|eine|einen|zwei|drei|vier|fuenf|sechs|sieben|acht|neun|zehn|elf|zwoelf)\b/g, (m) => WORTZAHL[m] || m);
}

/** Deterministische Slot-Extraktion aus dem Text (schnell, ohne LLM). */
function slotDeterministisch(text, detail) {
  const slot = String(detail?.slot || "");
  const typ = String(detail?.typ || "");
  const optionen = Array.isArray(detail?.optionen) ? detail.optionen : [];
  const t = normZahlwoerter(text);

  // Flaechen-artige Auswahl (1..4): "zweiflaechig", "2-flaechig", "zwei Flaechen"
  if (/flaech/i.test(slot) || optionen.some((o) => /fl[aä]chig/i.test(String(o?.label || "")))) {
    const m = t.match(/(\d)\s*[- ]?flaech/);
    if (m) {
      const n = parseInt(m[1], 10);
      const wert = n >= 4 ? "4" : String(n);
      if (!optionen.length || optionen.some((o) => String(o?.value) === wert)) return wert;
    }
  }

  // Anaesthesie-Auswahl: Infiltration / Leitung / keine
  if (/an[aä]sth/i.test(slot)) {
    if (/leitungsan|leitung/.test(t)) return optionen.some((o) => o?.value === "leitung") ? "leitung" : null;
    if (/infiltration/.test(t)) return optionen.some((o) => o?.value === "infiltration") ? "infiltration" : null;
    if (/(ohne|keine)\s+(an[aä]sthesie|anaesthesie|betaeubung)/.test(t)) return optionen.some((o) => o?.value === "keine") ? "keine" : null;
  }

  // Generische Auswahl: Options-Wert oder erstes sprechendes Label-Wort im Text.
  if (typ === "auswahl" && optionen.length) {
    for (const o of optionen) {
      const val = String(o?.value || "").toLowerCase();
      if (val && val.length >= 3 && t.includes(normZahlwoerter(val))) return String(o.value);
      const labelWort = String(o?.label || "").toLowerCase().replace(/\(.*?\)/g, "").trim().split(/[\s,/-]+/)[0];
      if (labelWort && labelWort.length >= 4 && t.includes(normZahlwoerter(labelWort))) return String(o.value);
    }
    // Ja/Nein-Auswahl: "mit Fluorid" -> ja, "ohne Fluorid" -> nein
    const hatJa = optionen.some((o) => o?.value === "ja");
    const hatNein = optionen.some((o) => o?.value === "nein");
    if (hatJa && hatNein) {
      const stamm = normZahlwoerter(slot).slice(0, 6);
      if (stamm && new RegExp(`(ohne|kein[e]?)\\s+\\w*${stamm}`).test(t)) return "nein";
      if (stamm && new RegExp(`${stamm}`).test(t)) return "ja";
    }
  }

  // Zahl-Slots: Zahl direkt vor/nach dem Slot-Substantiv ("3 Kanaele", "28 Zaehne").
  if (typ === "zahl") {
    const stamm = normZahlwoerter(slot).replace(/e$/, "").slice(0, 5); // kanaele->kanal, zaehne->zaehn
    if (stamm.length >= 3) {
      const m = t.match(new RegExp(`(\\d{1,2})\\s*(?:[a-z-]*\\s+)?[a-z]*${stamm}`))
        || t.match(new RegExp(`${stamm}[a-z]*\\s*[: ]\\s*(\\d{1,2})`));
      if (m) return m[1];
    }
  }
  return null;
}

/** LLM-Rueckfallebene: beantwortet die Gegenfrage aus dem Text — oder null. */
async function slotPerLlm(text, detail, timeoutMs = 6000) {
  const optionen = Array.isArray(detail?.optionen) ? detail.optionen : [];
  const res = await chat([
    {
      role: "system",
      content: [
        "Beantworte die Frage AUSSCHLIESSLICH aus dem gegebenen Behandlungstext.",
        "Antworte NUR mit dem Wert, ohne Erklaerung.",
        optionen.length
          ? `Erlaubte Werte: ${optionen.map((o) => String(o?.value)).join(", ")} — oder null, wenn der Text es nicht hergibt.`
          : "Antworte mit der Zahl/dem Wert — oder null, wenn der Text es nicht hergibt.",
        "NIEMALS raten: steht es nicht im Text, antworte null.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `FRAGE: ${detail?.frage || detail?.slot}\nTEXT: "${String(text).slice(0, 900)}"`,
    },
  ], { temperature: 0, maxTokens: 20, timeoutMs });
  if (!res.ok) return null;
  const roh = String(res.text || "").trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (!roh || roh === "null" || roh === "unbekannt" || roh === "keine angabe") return null;
  if (optionen.length) {
    const hit = optionen.find((o) => String(o?.value).toLowerCase() === roh);
    return hit ? String(hit.value) : null;
  }
  const zahl = roh.match(/\d{1,3}/);
  return zahl ? zahl[0] : null;
}

/** Steigerungsfaktor aus dem Text ziehen ("Faktor 3,5" / "3,5-fach"). */
function faktorAusText(text) {
  const m = String(text || "").toLowerCase().match(/faktor\s*([0-9]+(?:[.,][0-9]+)?)|([0-9]+(?:[.,][0-9]+)?)\s*-?\s*fach/);
  const roh = m ? (m[1] || m[2]) : "";
  if (!roh) return undefined;
  const f = parseFloat(roh.replace(",", "."));
  return Number.isFinite(f) && f >= 1 && f <= 3.5 ? f : undefined;
}

/**
 * Sophie mit Slot-Fuellung: ruft die Strecken-Engine auf und beantwortet ihre
 * Gegenfragen selbst aus dem Text, solange das moeglich ist. Erst wenn der
 * Text eine Frage NICHT beantwortet, geht sie an den Chef.
 *
 * @param {string} clientId
 * @param {{text:string, appointmentId?:string, patientId?:string, lastName?:string}} args
 * @param {{quiet?:boolean, timeoutMs?:number}} opts
 */
export async function sophieMitSlotfill(clientId, args = {}, opts = {}) {
  const text = String(args.text || "").trim();
  const slots = {};
  const faktor = faktorAusText(text);
  let letzte = null;
  for (let runde = 0; runde < 6; runde++) {
    letzte = await sophieBill(clientId, { ...args, text, slots: Object.keys(slots).length ? slots : undefined, faktor }, opts);
    if (!letzte?.ok || letzte.status !== "needs_input") return letzte;
    const detail = letzte.frageDetail || null;
    const slotName = String(detail?.slot || letzte.slot || "");
    if (!slotName || slots[slotName] !== undefined) return letzte; // Schutz vor Endlosschleife
    let wert = slotDeterministisch(text, detail || { slot: slotName });
    if (wert == null) {
      try { wert = await slotPerLlm(text, detail || { slot: slotName, frage: letzte.message }); } catch { wert = null; }
    }
    if (wert == null) return letzte; // echte Frage an den Chef
    slots[slotName] = wert;
  }
  return letzte;
}

/**
 * Stille Sophie-Sonde: klinischer Text + gemerkte Hinweise -> naechste
 * Gegenfrage ODER "komplett" ODER "keine Zuordnung". Aktualisiert den
 * Arbeitsstand und liefert die SPRECHZEILE fuer Claras Bestaetigung.
 *
 * Sprech-Politik ("Fragen nie vergessen, aber nicht nerven"):
 *   - needs_input: Gegenfrage IMMER ansagen — bei jedem Memo erneut, bis
 *     beantwortet.
 *   - complete:    nur ansagen, wenn der Status NEU auf komplett springt oder
 *     das Memo ausdruecklich Abrechnung enthielt. Endsummen erst auf "rechne ab".
 *   - no_match:    nur ansagen, wenn das Memo ausdruecklich Abrechnung enthielt
 *     (reine Doku-Memos ohne abrechenbare Strecke sind kein Fehler).
 *
 * @param {string} clientId
 * @param {{appointmentId:string, klinischText:string, explizit:boolean,
 *          patientId?:string, lastName?:string, timeoutMs?:number}} args
 * @returns {Promise<{zeile:string, status:string, frage:string, label:string}>}
 */
export async function pruefeAbrechnung(clientId, { appointmentId, klinischText, explizit = false, patientId = "", lastName = "", timeoutMs = 12000 } = {}) {
  const memo = await getAbrechnungsMemo(clientId, appointmentId);
  const klinisch = norm(klinischText).slice(-1200); // juengste Angaben zaehlen
  const gesamt = [klinisch, memo.hinweise].filter(Boolean).join(" ").trim();
  if (!gesamt) return { zeile: "", status: "leer", frage: "", label: "" };

  let r;
  try {
    r = await sophieMitSlotfill(clientId, { text: gesamt }, { quiet: true, timeoutMs });
  } catch {
    return { zeile: "", status: "fehler", frage: "", label: "" };
  }
  if (!r || r.ok !== true) return { zeile: "", status: "fehler", frage: "", label: "" };

  const status = String(r.status || "");
  const frage = status === "needs_input" ? String(r.message || "") : "";
  const label = String(r.label || "");
  const statusNeu = status !== memo.lastStatus || (frage && frage !== memo.lastFrage);

  if (appointmentId) {
    try {
      await memoRef(clientId, appointmentId).set({
        lastStatus: status,
        lastFrage: frage,
        lastLabel: label,
        patientId: patientId || null,
        lastName: lastName || null,
        updatedAtMs: Date.now(),
      }, { merge: true });
    } catch { /* Arbeitsstand ist Komfort */ }
  }

  let zeile = "";
  if (status === "needs_input" && frage) {
    zeile = `Zur Abrechnung fragt Sophie: ${frage}`;
  } else if (status === "complete" && (explizit || statusNeu)) {
    zeile = `Fuer die Abrechnung habe ich alles beisammen${label ? ` — ${label}` : ""}. Sag einfach "rechne ab", wenn ich den Vorschlag ansagen soll.`;
  } else if (status === "no_match" && explizit) {
    zeile = "Fuer die Abrechnung konnte ich die Behandlung noch keiner Strecke zuordnen — beschreib sie kurz genauer, wenn abgerechnet werden soll.";
  }
  return { zeile, status, frage, label };
}
