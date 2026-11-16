/**
 * KI-Zeile im offenen PlanR-Plan: das Modell bekommt den ganzen Plan (Positionen, Schalter,
 * Prüfhinweise), dazu Ausschluss-Tabelle und Abrechnungswissen, und antwortet auf genau
 * diesen Plan. Änderungen kommen als Schritte zurück; der Planer führt sie aus.
 * Hier wird nichts gespeichert und kein Patient übergeben.
 */
import { ausschluesseZwischen, ausschlussSatz, planPruefen } from "./ausschluss.js";

export const PLAN_KI_SYSTEM = `Du bist Clara, die Abrechnungsassistentin in PlanR. Der Zahnarzt hat genau EINEN Plan geöffnet und schreibt in die KI-Zeile dieses Plans. Du bekommst:
- PLAN: Planart, alle Positionen (id, ebene, nr, zahn, anzahl, faktor, betrag, text; auto=true hat der Planer selbst angesetzt), Summen, Angaben.
- SCHALTER: Einstellungen des Planers mit ihrem jetzigen Wert. Ein Schalter bringt seine Leistungen samt Begleitleistungen und Ausschlüssen selbst.
- PRÜFHINWEISE: was die Prüfung an diesem Plan gefunden hat.
- AUSSCHLUSS-TABELLE: gilt immer, auch gegen deine Erinnerung.
- WISSEN: Auszüge aus den Abrechnungsbestimmungen.

Regeln:
1. Du sprichst immer über diesen Plan. Frage nie nach dem Patientennamen und nie, welcher Plan gemeint ist.
2. Antworte auf Deutsch, höchstens vier Sätze, konkret: Nummern, Zähne oder Regionen und Beträge aus PLAN. Erfinde keine Positionen, Beträge oder Bestimmungen. Steht etwas weder in PLAN noch in WISSEN oder der Tabelle, sag das offen.
3. Fragt er, ob eine Leistung noch dazu kann: prüfe, ob sie schon im PLAN steht (dann nenne Zahn, Anzahl, Betrag), ob die AUSSCHLUSS-TABELLE sie neben einer Position des Plans am selben Zahn oder in derselben Region ausschließt, und was WISSEN verlangt. Nenne den Grund.
4. Will er eine Änderung, oder fragt er, ob etwas geht, und bittet zugleich darum: gib die Schritte dafür, aber nur wenn die Änderung zulässig ist. Ist sie es nicht, gib keine Schritte und nenne den Grund.
5. Schalter vor "hinzu": Gibt es einen SCHALTER, der die gewünschte Leistung bringt, nimm den Schalter. Nur ohne passenden Schalter eine Position mit "hinzu".
6. Fehlt eine nötige Angabe (Zahn oder Region) und kommen mehrere in Frage, stelle genau EINE Rückfrage und gib keine Schritte. Kommt nur ein Zahn oder eine Region in Frage, nimm diese.
7. Ist der Plan gesperrt (gesperrt=true), änderst du nichts und sagst, dass er freigegeben ist.
8. Nimm nur Schritt-Arten aus ERLAUBT. Für "weg" und "setze" nur ids aus PLAN, für "schalter" nur Namen aus SCHALTER.
9. In "antwort" steht bei einer Änderung, was du änderst und warum das zulässig ist. Neue Summen nennst du nicht, die meldet die Seite nach der Änderung selbst.

Schritte:
{"op":"schalter","name":"<Name aus SCHALTER>","wert":true}
{"op":"hinzu","ebene":"GOZ","nr":"9100","zahn":"16","anzahl":1,"faktor":2.3}
{"op":"setze","id":"<id>","anzahl":2,"faktor":3.5,"begruendung":"..."}
{"op":"weg","id":"<id>"}
{"op":"zurueck"}   (nimmt die letzte Änderung aus dieser Zeile zurück)

Antworte nur mit JSON: {"antwort":"...","schritte":[...]}. Ohne Änderung ist schritte leer. Kein Markdown.`;

const OPS = ["schalter", "hinzu", "setze", "weg", "zurueck"];
const klein = (s) => String(s || "").toLowerCase();
const zahl = (x) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() && Number.isFinite(Number(x.replace(",", "."))) ? Number(x.replace(",", ".")) : null);

/** Plan aus dem Browser auf das Nötige kürzen; nichts davon ist ein Patientenfeld. */
export function blickSaeubern(roh) {
  const b = roh && typeof roh === "object" ? roh : {};
  const s = (x, n) => String(x ?? "").slice(0, n);
  const positionen = (Array.isArray(b.positionen) ? b.positionen : []).slice(0, 400).map((p) => ({
    id: s(p?.id, 80), ebene: s(p?.ebene, 8), nr: s(p?.nr, 24), zahn: s(p?.zahn, 60),
    anzahl: zahl(p?.anzahl) ?? 1,
    ...(zahl(p?.faktor) != null ? { faktor: zahl(p.faktor) } : {}),
    betrag: zahl(p?.betrag) ?? 0, text: s(p?.text, 140),
    ...(p?.auto ? { auto: true } : {}),
    ...(zahl(p?.sitzung) != null ? { sitzung: zahl(p.sitzung) } : {}),
  })).filter((p) => p.id && p.nr);
  const schalter = (Array.isArray(b.schalter) ? b.schalter : []).slice(0, 120).map((x) => ({
    name: s(x?.name, 80), text: s(x?.text, 160),
    wert: typeof x?.wert === "boolean" || typeof x?.wert === "number" ? x.wert : s(x?.wert, 60),
    ...(Array.isArray(x?.werte) ? { werte: x.werte.slice(0, 20).map((w) => s(w, 60)) } : {}),
  })).filter((x) => x.name);
  const paare = (o, n) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).slice(0, n).map(([k, v]) => [s(k, 40), typeof v === "number" ? v : s(v, 300)]));
  return {
    planart: s(b.planart, 40), name: s(b.name, 80), gesperrt: b.gesperrt === true,
    kann: (Array.isArray(b.kann) ? b.kann : []).map(String).filter((o) => OPS.includes(o)),
    ebenen: (Array.isArray(b.ebenen) ? b.ebenen : []).slice(0, 10).map((e) => s(e, 8)),
    positionen, schalter, summen: paare(b.summen, 20), angaben: paare(b.angaben, 30),
    hinweise: (Array.isArray(b.hinweise) ? b.hinweise : []).slice(0, 40).map((h) => ({ stufe: s(h?.stufe, 10), text: s(h?.text, 300) })).filter((h) => h.text),
  };
}

/** Wörter des Satzes, die eine Nummer sein können (enthalten eine Ziffer) */
function nummernImSatz(text) {
  return [...new Set(String(text || "").split(/[^0-9A-Za-zÄÖÜäöü]+/).filter((w) => w && w.length <= 8 && /\d/.test(w)).map(klein))];
}

/** Sätze der Ausschluss-Tabelle: gefragte Nummer gegen den Plan, und Paare im Plan selbst */
export function tabelleFuer(text, blick) {
  const gefragt = nummernImSatz(text);
  const imPlan = [...new Set(blick.positionen.map((p) => klein(p.nr)))];
  const saetze = new Set();
  if (gefragt.length) {
    for (const e of ausschluesseZwischen([...gefragt, ...imPlan])) {
      if (gefragt.includes(klein(e.a)) || gefragt.includes(klein(e.b))) saetze.add(ausschlussSatz(e));
    }
  }
  for (const t of planPruefen(blick.positionen)) saetze.add(t.hinweis);
  return [...saetze].slice(0, 12);
}

/** Prüfmodul: Ausschlüsse zwischen den Positionen eines Plans, mit Fundstelle */
export function planPruefung(positionen) {
  const pos = (Array.isArray(positionen) ? positionen : []).slice(0, 400)
    .map((p) => ({ ebene: String(p?.ebene || "").slice(0, 8), nr: String(p?.nr || "").slice(0, 24), zahn: String(p?.zahn || "").slice(0, 60) }))
    .filter((p) => p.ebene && p.nr);
  const gesehen = new Set();
  const raus = [];
  for (const t of planPruefen(pos)) {
    if (gesehen.has(t.hinweis)) continue;
    gesehen.add(t.hinweis);
    raus.push({ stufe: "fehler", text: t.hinweis, a: t.a, b: t.b, katalog: t.k });
  }
  return raus.slice(0, 40);
}

export function planKiNachricht({ text, blick, verlauf = [], tabelle = [], wissen = "" }) {
  const zuvor = (Array.isArray(verlauf) ? verlauf : []).slice(-6)
    .map((z) => `${z?.wer === "clara" ? "Clara" : "Zahnarzt"}: ${String(z?.text || "").slice(0, 400)}`).join("\n");
  const plan = { planart: blick.planart, name: blick.name, gesperrt: blick.gesperrt, angaben: blick.angaben, summen: blick.summen, positionen: blick.positionen };
  return [
    `ERLAUBT: ${blick.gesperrt ? "nichts (Plan gesperrt)" : blick.kann.join(", ") || "nichts (dieser Planer nimmt von hier noch keine Änderungen an)"}${blick.ebenen.length ? `\nEbenen für "hinzu": ${blick.ebenen.join(", ")}` : ""}`,
    `PLAN:\n${JSON.stringify(plan)}`,
    `SCHALTER:\n${blick.schalter.length ? JSON.stringify(blick.schalter) : "keine"}`,
    `PRÜFHINWEISE:\n${blick.hinweise.length ? blick.hinweise.map((h) => `- [${h.stufe}] ${h.text}`).join("\n") : "keine"}`,
    `AUSSCHLUSS-TABELLE:\n${tabelle.length ? tabelle.map((t) => `- ${t}`).join("\n") : "kein Treffer zu den genannten Nummern und diesem Plan"}`,
    `WISSEN:\n${String(wissen || "").slice(0, 6000) || "nichts gefunden"}`,
    zuvor ? `BISHER IN DIESER ZEILE:\n${zuvor}` : "",
    `Zahnarzt jetzt: «${String(text || "").slice(0, 1200)}»`,
  ].filter(Boolean).join("\n\n");
}

/** Antwort des Modells prüfen: nur Schritte, die dieser Plan zulässt. Ungültiges -> null. */
export function planKiLesen(rohText, blick) {
  const roh = String(rohText || "");
  const nachDenken = roh.lastIndexOf("</think>");
  const kern = nachDenken >= 0 ? roh.slice(nachDenken + 8) : roh;
  const start = kern.indexOf("{");
  const ende = kern.lastIndexOf("}");
  if (start < 0 || ende <= start) return null;
  let daten = null;
  try { daten = JSON.parse(kern.slice(start, ende + 1)); } catch { return null; }
  if (!daten || typeof daten !== "object") return null;
  const antwort = String(daten.antwort || "").trim().slice(0, 1200);
  if (!antwort) return null;
  const ids = new Set(blick.positionen.map((p) => p.id));
  const schalter = new Map(blick.schalter.map((s) => [s.name, s]));
  const kann = new Set(blick.gesperrt ? [] : blick.kann);
  const schritte = [];
  const verworfen = [];
  for (const s of (Array.isArray(daten.schritte) ? daten.schritte : []).slice(0, 12)) {
    const op = String(s?.op || "");
    if (!kann.has(op)) { verworfen.push(op || "?"); continue; }
    if (op === "zurueck") { schritte.push({ op }); continue; }
    if (op === "weg") {
      if (ids.has(String(s.id))) schritte.push({ op, id: String(s.id) }); else verworfen.push("weg");
      continue;
    }
    if (op === "setze") {
      if (!ids.has(String(s.id))) { verworfen.push("setze"); continue; }
      const neu = { op, id: String(s.id) };
      const anzahl = zahl(s.anzahl), faktor = zahl(s.faktor), preis = zahl(s.preis);
      if (anzahl != null && anzahl >= 1 && anzahl <= 99) neu.anzahl = Math.round(anzahl);
      if (faktor != null && faktor >= 1 && faktor <= 10) neu.faktor = Math.round(faktor * 100) / 100;
      if (preis != null && preis >= 0 && preis <= 100000) neu.preis = Math.round(preis * 100) / 100;
      if (typeof s.begruendung === "string" && s.begruendung.trim()) neu.begruendung = s.begruendung.trim().slice(0, 300);
      if (Object.keys(neu).length > 2) schritte.push(neu); else verworfen.push("setze");
      continue;
    }
    if (op === "schalter") {
      const ziel = schalter.get(String(s.name));
      if (!ziel) { verworfen.push("schalter"); continue; }
      let wert = s.wert;
      if (typeof ziel.wert === "boolean") {
        if (typeof wert !== "boolean") { verworfen.push("schalter"); continue; }
      } else if (typeof ziel.wert === "number") {
        wert = zahl(wert);
        if (wert == null) { verworfen.push("schalter"); continue; }
      } else {
        wert = String(wert ?? "");
        if (ziel.werte && !ziel.werte.includes(wert)) { verworfen.push("schalter"); continue; }
      }
      schritte.push({ op, name: ziel.name, wert });
      continue;
    }
    if (op === "hinzu") {
      const ebene = String(s.ebene || "").toUpperCase().replace("GOÄ", "GOAE");
      const nr = String(s.nr || "").trim().slice(0, 24);
      if (!nr || (blick.ebenen.length && !blick.ebenen.includes(ebene))) { verworfen.push("hinzu"); continue; }
      const neu = { op, ebene, nr, zahn: String(s.zahn ?? "").trim().slice(0, 40), anzahl: 1 };
      const anzahl = zahl(s.anzahl), faktor = zahl(s.faktor), preis = zahl(s.preis);
      if (anzahl != null && anzahl >= 1 && anzahl <= 99) neu.anzahl = Math.round(anzahl);
      if (faktor != null && faktor >= 1 && faktor <= 10) neu.faktor = Math.round(faktor * 100) / 100;
      if (preis != null && preis >= 0 && preis <= 100000) neu.preis = Math.round(preis * 100) / 100;
      if (typeof s.text === "string" && s.text.trim()) neu.text = s.text.trim().slice(0, 160);
      schritte.push(neu);
    }
  }
  return { antwort, schritte, verworfen };
}
