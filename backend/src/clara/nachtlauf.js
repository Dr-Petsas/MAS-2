// ============================================================================
// NACHTLAUF (06.10.2026)
//
// Nachts startet MAS F:\Clara-Voice\tools\nachtlauf.py: Pruefliste aus dem
// Gespraechsprotokoll des Vortags (Korrekturen des Chefs, Waechter-Eingriffe,
// Notsaetze) plus Voll-Gate (SAFE). Der Morgenlauf meldet das Ergebnis mit dem
// Morgen-Push; /m/clara-pruefliste.html zeigt die Liste, ein Klick haengt den
// Testfall-Vorschlag an testsuite/dialogs_aus_gespraechen.json an.
//
// Not-Aus: CLARA_NACHTLAUF=0. Zeit: CLARA_NACHTLAUF_ZEIT (Default "02:30").
// ============================================================================
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { log } from "../log.js";

const CLARA_DIR = (process.env.CLARA_VOICE_DIR || "F:/Clara-Voice").trim();
const PYTHON = (process.env.CLARA_PYTHON || "python").trim();
const LAUF_TIMEOUT_MS = 100 * 60_000;
const NACHT_MAX_ALTER_MS = 20 * 3600_000;
const LISTE_TAGE = 7;

let laufAktiv = false;

function pfade(claraDir = CLARA_DIR) {
  return {
    nacht: path.join(claraDir, ".run", "nachtlauf", "letzter.json"),
    pruef: path.join(claraDir, ".run", "pruefliste"),
    testfaelle: path.join(claraDir, "testsuite", "dialogs_aus_gespraechen.json"),
  };
}

function jsonLesen(datei) {
  try {
    return JSON.parse(fs.readFileSync(datei, "utf8"));
  } catch {
    return null;
  }
}

function jsonSchreiben(datei, daten) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(daten, null, 1), "utf8");
  fs.renameSync(tmp, datei);
}

export function runNachtlauf({ ohneVolltest = false, tag = "" } = {}) {
  if (laufAktiv) return Promise.resolve({ ok: false, skipped: true, reason: "lauf_bereits_aktiv" });
  laufAktiv = true;
  return new Promise((resolve) => {
    const args = ["tools/nachtlauf.py"];
    if (ohneVolltest) args.push("--ohne-volltest");
    if (/^\d{8}$/.test(tag)) args.push("--tag", tag);
    let out = "";
    let child;
    const fertig = (r) => { laufAktiv = false; resolve(r); };
    try {
      child = spawn(PYTHON, args, { cwd: CLARA_DIR, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    } catch (e) {
      return fertig({ ok: false, error: String(e?.message || e) });
    }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* schon tot */ } }, LAUF_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out = (out + String(d)).slice(-20_000); });
    child.stderr.on("data", (d) => { out = (out + String(d)).slice(-20_000); });
    child.on("error", (e) => { clearTimeout(timer); fertig({ ok: false, error: String(e?.message || e) }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const ergebnis = leseNachtlauf({ maxAlterMs: LAUF_TIMEOUT_MS + 60_000 });
      log.info("nachtlauf.done", { code, volltest: ergebnis?.volltest?.ok ?? null, pruefliste: ergebnis?.pruefliste?.anzahl ?? null });
      fertig({ ok: code === 0, code, ergebnis, tail: out.slice(-1500) });
    });
  });
}

/** letzter.json des Nachtlaufs, wenn juenger als maxAlterMs (sonst null). */
export function leseNachtlauf({ claraDir = CLARA_DIR, maxAlterMs = NACHT_MAX_ALTER_MS, jetzt = Date.now() } = {}) {
  const daten = jsonLesen(pfade(claraDir).nacht);
  if (!daten?.beendet) return null;
  const t = Date.parse(daten.beendet);
  if (!Number.isFinite(t) || jetzt - t > maxAlterMs) return null;
  return daten;
}

/** Eine Zeile fuer den Morgen-Push. */
export function nachtlaufZeile(nacht) {
  if (!nacht) return "Nachtlauf fehlt";
  const v = nacht.volltest;
  let test = "Nachttest fehlt";
  if (v) {
    const bilanz = v.gesamt != null ? `${v.bestanden}/${v.gesamt}` : "";
    test = v.ok ? `Nachttest gruen${bilanz ? ` ${bilanz}` : ""}`
      : `Nachttest ROT${bilanz ? ` ${bilanz}` : ""}${v.schritte_rot?.length ? ` (${v.schritte_rot.join(", ")})` : ""}`;
  }
  const offen = Number(nacht.pruefliste?.offen || 0);
  return offen ? `${test} | Pruefliste ${offen}` : test;
}

/** Eintraege der letzten Tage, neueste zuerst. */
export function prueflisteLaden({ claraDir = CLARA_DIR, tage = LISTE_TAGE } = {}) {
  const dir = pfade(claraDir).pruef;
  let dateien = [];
  try {
    dateien = fs.readdirSync(dir).filter((f) => /^pruefliste-\d{8}\.json$/.test(f)).sort().reverse().slice(0, tage);
  } catch {
    return [];
  }
  return dateien.map((f) => jsonLesen(path.join(dir, f))).filter(Boolean)
    .map((d) => ({ tag: d.tag, erstellt: d.erstellt, eintraege: d.eintraege || [] }));
}

function dialogPruefen(d) {
  if (!d || typeof d !== "object") return "kein Testfall";
  if (!/^[\w-]{3,80}$/.test(String(d.id || ""))) return "ungueltige id";
  if (!Array.isArray(d.turns) || !d.turns.length || d.turns.length > 12) return "turns fehlen";
  if (d.turns.some((t) => !t || typeof t.text !== "string" || !t.text.trim())) return "leerer Zug";
  const letzter = d.turns[d.turns.length - 1];
  const geprueft = (d.dialog_expect && (d.dialog_expect.final_executed?.length || d.dialog_expect.never_called?.length))
    || d.turns.some((t) => t.expect_tool?.length || t.say_contains?.length || t.say_not_contains?.length);
  if (!geprueft) return "keine Erwartung — bitte Ziel-Werkzeug oder verbotenen Satz eintragen";
  if (letzter.text.length > 600) return "Zug zu lang";
  return "";
}

function eintragSetzen(claraDir, tag, id, felder) {
  const datei = path.join(pfade(claraDir).pruef, `pruefliste-${tag}.json`);
  const daten = jsonLesen(datei);
  const e = daten?.eintraege?.find((x) => x.id === id);
  if (!e) return null;
  Object.assign(e, felder, { entschieden: new Date().toISOString() });
  jsonSchreiben(datei, daten);
  return e;
}

/** Vorschlag (oder bearbeitete Fassung) als dauerhaften Testfall uebernehmen. */
export function testfallUebernehmen({ tag, id, dialog } = {}, { claraDir = CLARA_DIR } = {}) {
  if (!/^\d{8}$/.test(String(tag || "")) || !id) return { ok: false, error: "tag/id fehlt" };
  const liste = jsonLesen(path.join(pfade(claraDir).pruef, `pruefliste-${tag}.json`));
  const eintrag = liste?.eintraege?.find((x) => x.id === id);
  if (!eintrag) return { ok: false, error: "Eintrag nicht gefunden" };
  const d = dialog && typeof dialog === "object" ? dialog : eintrag.vorschlag;
  const fehler = dialogPruefen(d);
  if (fehler) return { ok: false, error: fehler };
  const datei = pfade(claraDir).testfaelle;
  const bestand = jsonLesen(datei) || {
    comment: "Per Klick aus der Nachtlauf-Pruefliste uebernommene Stellen echter Gespraeche (MAS /m/clara-pruefliste.html). Format wie dialogs.json.",
    dialogs: [],
  };
  const sauber = { ...d, category: d.category || "aus_gespraech" };
  bestand.dialogs = [...(bestand.dialogs || []).filter((x) => x.id !== sauber.id), sauber];
  jsonSchreiben(datei, bestand);
  eintragSetzen(claraDir, tag, id, { status: "uebernommen" });
  return { ok: true, id: sauber.id, anzahl: bestand.dialogs.length };
}

export function prueflisteVerwerfen({ tag, id } = {}, { claraDir = CLARA_DIR } = {}) {
  if (!/^\d{8}$/.test(String(tag || "")) || !id) return { ok: false, error: "tag/id fehlt" };
  return eintragSetzen(claraDir, tag, id, { status: "verworfen" }) ? { ok: true } : { ok: false, error: "Eintrag nicht gefunden" };
}
