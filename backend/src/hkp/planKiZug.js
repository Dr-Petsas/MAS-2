/**
 * Ein Zug der KI-Zeile im offenen Plan: Satz samt ganzem Plan an das Modell, Antwort und geprüfte Schritte zurück.
 * Die Route /planr/plan-ki und die Probe (scripts/plan-ki-probe.mjs) rufen genau diese Funktion.
 * Nichts wird gespeichert.
 */
import { log } from "../log.js";
import { chat, strongLlm } from "../mail/llm.js";
import { PLAN_KI_SYSTEM, blickSaeubern, planKiLesen, planKiNachricht, tabelleFuer } from "./planKi.js";
import { wissenSuchen } from "./wissen.js";

/**
 * Antwortform, die der Server dem Modell fest vorgibt: Feldnamen, Schritt-Arten und die ids und
 * Schalternamen dieses Plans. Erfundene ids oder Schalter kann das Modell so gar nicht schreiben.
 */
export function planKiForm(blick) {
  const zahlW = { type: "number" }, text = { type: "string" };
  const wert = { anyOf: [{ type: "boolean" }, zahlW, text] };
  const ids = blick.positionen.map((p) => p.id);
  const namen = blick.schalter.map((s) => s.name);
  const id = ids.length ? { type: "string", enum: ids } : text;
  const kann = new Set(blick.gesperrt ? [] : blick.kann);
  const art = (op, properties, required) => ({ type: "object", properties: { op: { type: "string", enum: [op] }, ...properties }, required: ["op", ...required], additionalProperties: false });
  const arten = [
    kann.has("schalter") && namen.length && art("schalter", { name: { type: "string", enum: namen }, wert }, ["name", "wert"]),
    kann.has("hinzu") && art("hinzu", { ebene: blick.ebenen.length ? { type: "string", enum: blick.ebenen } : text, nr: text, zahn: text, anzahl: { type: "integer" }, faktor: zahlW, preis: zahlW, text }, ["ebene", "nr", "zahn", "anzahl"]),
    kann.has("setze") && ids.length && art("setze", { id, anzahl: { type: "integer" }, faktor: zahlW, preis: zahlW, begruendung: text }, ["id"]),
    kann.has("weg") && ids.length && art("weg", { id }, ["id"]),
    kann.has("zahn") && (blick.zahnfelder || []).length && art("zahn", { zahn: text, felder: { type: "object", properties: Object.fromEntries(blick.zahnfelder.map((f) => [f.name, f.ja ? { type: "boolean" } : f.werte ? { type: "string", enum: Object.keys(f.werte) } : zahlW])), additionalProperties: false } }, ["zahn", "felder"]),
    kann.has("zurueck") && art("zurueck", {}, []),
  ].filter(Boolean);
  return {
    type: "object",
    properties: {
      aendert: { type: "boolean" },
      schritte: arten.length ? { type: "array", items: { anyOf: arten } } : { type: "array", maxItems: 0 },
      antwort: text,
      pruefung: { type: "boolean" },
      entschieden: { type: "boolean" },
      doppelt_ok: { type: "array", items: { type: "object", properties: { ids: { type: "array", items: id }, grund: text }, required: ["ids", "grund"], additionalProperties: false } },
    },
    required: ["aendert", "schritte", "antwort", "pruefung"],
    additionalProperties: false,
  };
}

export async function planKiZug(b = {}) {
  const text = String(b.text || "").trim().slice(0, 1200);
  const blick = blickSaeubern(b.blick);
  if (!text || !blick.planart) return { ok: false, message: "Kein Text oder kein Plan." };
  const tabelle = tabelleFuer(text, blick);
  // Zu doppelt gemeldeten Leistungen die Bestimmungen mitsuchen: das Modell beurteilt, ob die Doppelung zulaessig ist.
  const doppelte = [...new Set(blick.hinweise.filter((x) => x.art === "doppelt").flatMap((x) => x.ids || [])
    .map((i) => blick.positionen.find((p) => p.id === i)).filter(Boolean).map((p) => `${p.ebene} ${p.nr} ${p.text}`))].slice(0, 6);
  const wissen = await wissenSuchen(doppelte.length ? `${text} ${doppelte.join(" ")}` : text, null).catch(() => "");
  const { base, model } = strongLlm();
  const nachrichten = [
    { role: "system", content: PLAN_KI_SYSTEM },
    { role: "user", content: planKiNachricht({ text, blick, verlauf: b.verlauf, tabelle, wissen, nachlauf: b.nachlauf }) },
  ];
  const beginn = Date.now();
  const frist = Number(process.env.MAS_PLAN_KI_MS || 55000);
  // Die Antwortform gibt der Server dem Modell fest vor (Feldnamen und Reihenfolge); kann er das nicht, gilt die freie Antwort.
  let form = process.env.MAS_PLAN_KI_FORM !== "0";
  const fragen = async (timeoutMs) => {
    const o = { temperature: 0.1, maxTokens: Number(process.env.MAS_PLAN_KI_TOKENS || 2500), model, baseUrl: base, timeoutMs };
    if (form) {
      const start = Date.now();
      const a = await chat(nachrichten, { ...o, extraBody: { response_format: { type: "json_schema", json_schema: { name: "plan_ki", schema: planKiForm(blick) } } } });
      if (a.ok) return a;
      form = false;
      log.warn?.(`[planr] plan-ki: feste Antwortform ohne Antwort (${a.error || "?"}, ${Date.now() - start} ms), frei weiter`);
      timeoutMs -= Date.now() - start;
      if (timeoutMs < 5000) return a;
    }
    return chat(nachrichten, { ...o, timeoutMs });
  };
  let antwort = await fragen(frist);
  let ergebnis = antwort.ok ? planKiLesen(antwort.text, blick) : null;
  // Kam kein lesbares JSON und ist noch Zeit, ein zweiter Versuch statt einer leeren Antwort.
  const rest = frist - (Date.now() - beginn);
  if (!ergebnis && antwort.ok && rest > 15000) {
    log.warn?.("[planr] plan-ki: Antwort ohne JSON, zweiter Versuch");
    antwort = await fragen(rest);
    ergebnis = antwort.ok ? planKiLesen(antwort.text, blick) : null;
  }
  // Entscheidung der Praxis angekommen, aber kein Schritt dazu: einmal nachhaken statt einer leeren Zusage.
  const ohneSchritt = (e) => e && e.entschieden && !e.schritte.length;
  if (ohneSchritt(ergebnis) && frist - (Date.now() - beginn) > 15000) {
    log.warn?.("[planr] plan-ki: entschieden ohne Schritt, zweiter Versuch");
    nachrichten.push({ role: "assistant", content: antwort.text }, { role: "user", content: 'Du hast "entschieden":true gesetzt, aber "schritte" ist leer. Gib dieselbe Antwort noch einmal als JSON, diesmal mit den Schritten für genau das, was der Arzt entschieden hat. Bringt kein SCHALTER die Position, nimm "weg" mit ihrer id. Hat er entschieden, dass alles bleibt, lass "schritte" leer und sage in "antwort" nur, dass nichts geändert wird.' });
    const zweite = await fragen(frist - (Date.now() - beginn));
    const neu = zweite.ok ? planKiLesen(zweite.text, blick) : null;
    if (neu && neu.entschieden) ergebnis = neu;
  }
  // Aenderung angekuendigt ("aendert":true), aber kein Schritt geliefert und keiner verworfen: einmal nachhaken.
  const angekuendigt = (e) => e && !e.pruefung && !e.entschieden && !e.schritte.length && (e.aendert || e.verworfen.length > 0);
  if (angekuendigt(ergebnis) && frist - (Date.now() - beginn) > 15000) {
    log.warn?.(`[planr] plan-ki: Aenderung angekuendigt ohne Schritt, zweiter Versuch (verworfen: ${ergebnis.verworfen.join(", ") || "-"}) ${process.env.MAS_PLAN_KI_ROH ? antwort.text.slice(0, 900) : ""}`);
    nachrichten.push({ role: "assistant", content: antwort.text }, { role: "user", content: 'Du hast eine Änderung angekündigt, aber es ist kein gültiger Schritt angekommen. So ändert sich am Plan nichts (ein Schritt mit einem Feld oder Wert, den ZAHNSCHEMA, SCHALTER oder PLAN nicht kennt, wird verworfen). Gib dieselbe Antwort noch einmal als JSON, diesmal mit den Schritten für genau diese Änderung (für Befund, Planung und Angaben je Zahn der Schritt "zahn" mit den Feldern aus ZAHNSCHEMA). Ist die Änderung nicht möglich, setze "aendert":false und nenne in "antwort" den Grund.' });
    const zweite = await fragen(frist - (Date.now() - beginn));
    const neu = zweite.ok ? planKiLesen(zweite.text, blick) : null;
    if (neu) ergebnis = neu;
  }
  if (!ergebnis) {
    log.warn?.(`[planr] plan-ki ohne brauchbare Antwort (${antwort.ok ? "kein JSON" : antwort.error || "Modell"})`);
    return { ok: false, message: "Dazu habe ich gerade keine Antwort bekommen. Der Plan ist unveraendert." };
  }
  if (ergebnis.verworfen.length) log.warn?.(`[planr] plan-ki: Schritte verworfen: ${ergebnis.verworfen.join(", ")}`);
  log.info?.(`[planr] plan-ki ${blick.planart} positionen=${blick.positionen.length} schritte=${ergebnis.schritte.length} tabelle=${tabelle.length} ms=${Date.now() - beginn}`);
  // Hat der Korrekturlauf nur Unzulaessiges vorgeschlagen, gilt die Ankuendigung des Modells nicht.
  const leer = ergebnis.pruefung && !ergebnis.frage && !ergebnis.schritte.length && ergebnis.verworfen.length > 0;
  const antwortText = angekuendigt(ergebnis)
    ? "Das habe ich nicht in einen zulässigen Schritt für diesen Plan umsetzen können. Am Plan ist nichts geändert. Bitte sagen Sie es noch einmal mit Zahn und gewünschter Versorgung."
    : ohneSchritt(ergebnis)
    ? `${ergebnis.antwort} Am Plan ist damit nichts geändert.`
    : leer ? "Dafür habe ich keinen zulässigen Schritt gefunden. Am Plan habe ich nichts geändert." : ergebnis.antwort;
  return { ok: true, antwort: antwortText, schritte: ergebnis.schritte, verworfen: ergebnis.verworfen.length, pruefung: ergebnis.pruefung, ...(ergebnis.frage ? { frage: ergebnis.frage } : {}) };
}
