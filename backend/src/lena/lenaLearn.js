// Auto-Lernpfad fuer Lena (Chef 24.07.2026): "waechst aus Live-Korrekturen —
// vollautomatisch, kein human in the loop, aber sicher".
// ---------------------------------------------------------------------------
// Quelle: clients/{id}/lenaCorrections (Arzt-Korrekturen from->to, je Fachrichtung).
// Ablauf pro Lauf:
//   1. Neue Korrekturen seit Cursor lesen.
//   2. Wort-Diff from->to -> minimale Ersetzungspaare (falsch->richtig).
//   3. Kandidaten je Fachrichtung zaehlen (Pending-State in Firestore).
//   4. Promotion NUR wenn ALLE Sicherheits-Gates halten:
//        - Haeufigkeit >= MIN_COUNT (mehrfach beobachtet, kein Einzelfall)
//        - 'falsch' ist kein Alltagswort (sonst wuerde normale Rede zerstoert)
//        - plausible Verhoerung (Aehnlichkeit im Band, nicht identisch/fremd)
//        - nicht bereits in der kuratierten Basis/Overlay
//        - LLM-Gate (qwen3.6/5090): "korrekter Fachbegriff + plausible Verhoerung?"
//   5. Promotete Paare landen in einem ISOLIERTEN Overlay (lenaKnowledge/{spec}),
//      das die kuratierten <spec>.json NIE veraendert -> jederzeit reversibel.
//
// Not-Aus: MAS_LENA_LEARN=0. Overlay leeren: lenaKnowledge/{spec} loeschen.

import admin from "../firebase.js";
import { chat, strongLlm } from "../mail/llm.js";
import { resolveSpec, loadKb, buildCorrectionMap } from "./domainKnowledge.js";

const MIN_COUNT = Math.max(2, parseInt(process.env.LENA_LEARN_MIN_COUNT || "3", 10) || 3);
const MAX_LLM_PER_RUN = Math.max(1, parseInt(process.env.LENA_LEARN_MAX_LLM || "8", 10) || 8);
const MAX_DOCS_PER_RUN = 300;
const MAX_OVERLAY = 400;
const SIM_MIN = 0.34;   // darunter: kein plausibles Verhoeren (fremdes Wort)
const SIM_MAX = 0.95;   // darueber: quasi identisch (Gross-/Kleinschreibung o. Ae.)

// Kompakte Alltagswort-Sperre: solche 'falsch'-Trigger werden NIE gelernt,
// damit die deterministische Ersetzung normale Rede nicht zerstoert.
const COMMON = new Set([
  "der","die","das","und","oder","aber","auch","noch","dann","wenn","weil","dass",
  "ein","eine","einen","einem","einer","eines","kein","keine","nicht","nichts",
  "ich","du","er","sie","es","wir","ihr","mir","mich","dir","dich","ihm","ihn",
  "hier","dort","jetzt","heute","morgen","gestern","sehr","etwas","viel","mehr",
  "wieder","schon","immer","haben","hatte","hat","sein","ist","sind","war","waren",
  "wird","wurde","werden","kann","muss","soll","will","oben","unten","links","rechts",
  "vorne","hinten","bitte","danke","gut","gute","schlecht","gross","klein","neu","alt",
  "ja","nein","also","mal","nur","schon","bei","mit","von","zum","zur","auf","aus","im",
  "patient","patientin","termin","heute","woche","monat","jahr","tag","zeit",
]);

// ── Text-Utils ──────────────────────────────────────────────────────────────
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFC")
    .replace(/[^0-9a-zäöüß\s-]+/g, " ").replace(/\s+/g, " ").trim();
}
function levenshtein(a, b) {
  a = a || ""; b = b || "";
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
function similarity(a, b) {
  const A = norm(a).replace(/\s+/g, ""), B = norm(b).replace(/\s+/g, "");
  if (!A || !B) return 0;
  const d = levenshtein(A, B);
  return 1 - d / Math.max(A.length, B.length);
}

/**
 * Wort-Diff from->to -> minimale Ersetzungspaare (Substitutionen). Reine
 * Einfuegungen/Loeschungen werden ignoriert (nur echtes "verhoert -> gemeint").
 * Liefert [{falsch, richtig}] mit je <=3 Woertern pro Seite.
 */
export function wordDiffPairs(fromText, toText) {
  const a = String(fromText || "").trim().split(/\s+/).filter(Boolean);
  const b = String(toText || "").trim().split(/\s+/).filter(Boolean);
  if (!a.length || !b.length) return [];
  const al = a.map((t) => t.toLowerCase().replace(/[.,;:!?]+$/g, ""));
  const bl = b.map((t) => t.toLowerCase().replace(/[.,;:!?]+$/g, ""));
  // LCS-Tabelle
  const m = al.length, n = bl.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  let i = 0, j = 0, ai = [], bj = [];
  const flush = () => {
    if (ai.length && bj.length && ai.length <= 3 && bj.length <= 3) {
      pairs.push({ falsch: ai.join(" "), richtig: bj.join(" ") });
    }
    ai = []; bj = [];
  };
  while (i < m && j < n) {
    if (al[i] === bl[j]) { flush(); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ai.push(a[i]); i++; }
    else { bj.push(b[j]); j++; }
  }
  while (i < m) { ai.push(a[i]); i++; }
  while (j < n) { bj.push(b[j]); j++; }
  flush();
  return pairs;
}

/** Deterministische Gates (alle muessen halten), bevor das LLM ueberhaupt gefragt wird. */
export function gateOk(falsch, richtig, baseMap) {
  const fN = norm(falsch), rN = norm(richtig);
  if (!fN || !rN || fN === rN) return false;
  if (fN.length < 4 || fN.length > 40 || rN.length > 40) return false;
  if (!/[a-zäöüß]/.test(rN)) return false;
  const fWords = fN.split(" ");
  if (fWords.every((w) => COMMON.has(w))) return false;   // Trigger nur aus Alltagswoertern -> zu gefaehrlich
  const sim = similarity(fN, rN);
  if (sim < SIM_MIN || sim > SIM_MAX) return false;
  if (baseMap && Object.prototype.hasOwnProperty.call(baseMap, fN)) return false; // schon kuratiert
  return true;
}

// ── Firestore-Refs ───────────────────────────────────────────────────────────
const overlayRef = (spec) => admin.firestore().collection("lenaKnowledge").doc(spec);
const stateRef = (spec) => admin.firestore().collection("lenaLearnState").doc(spec);
const cursorRef = () => admin.firestore().collection("lenaLearnState").doc("_cursor");

// ── Serving: Overlay lesen (gecacht) ─────────────────────────────────────────
const _ovCache = new Map(); // spec -> { at, data }
const OV_TTL_MS = 60_000;

export async function loadOverlay(spec) {
  const key = resolveSpec(spec);
  const hit = _ovCache.get(key);
  if (hit && Date.now() - hit.at < OV_TTL_MS) return hit.data;
  let data = { verhoerungen: [], begriffe: [] };
  try {
    const snap = await overlayRef(key).get();
    if (snap.exists) {
      const d = snap.data() || {};
      data = {
        verhoerungen: Array.isArray(d.verhoerungen) ? d.verhoerungen.slice(0, MAX_OVERLAY) : [],
        begriffe: Array.isArray(d.begriffe) ? d.begriffe.slice(0, MAX_OVERLAY) : [],
      };
    }
  } catch { /* leeres Overlay */ }
  _ovCache.set(key, { at: Date.now(), data });
  return data;
}

/** Markdown-Block der gelernten Verhoerungen fuer den LLM-Korrektur-Kontext. */
export async function overlayContextBlock(spec) {
  const ov = await loadOverlay(spec);
  if (!ov.verhoerungen?.length) return "";
  const lines = ["## Zusaetzlich gelernte Verhoerungen (automatisch aus Korrekturen)"];
  for (const v of ov.verhoerungen.slice(0, 120)) lines.push(`- "${v.falsch}" -> "${v.richtig}"`);
  return lines.join("\n");
}

// ── LLM-Gate (qwen3.6/5090) ──────────────────────────────────────────────────
async function llmValidate(label, falsch, richtig) {
  const strong = strongLlm();
  const sys = "Du pruefst Korrekturen fuer deutsche medizinische Spracherkennung. Antworte AUSSCHLIESSLICH mit JSON {\"ok\": true|false}. ok=true nur wenn der 'richtig'-Ausdruck ein korrekter Fachbegriff/Ausdruck der genannten Fachrichtung ist UND 'falsch' eine plausible Verhoerung (Hoerfehler) davon ist. ok=false, wenn 'falsch' ein normales Alltagswort ist oder 'richtig' kein Fachbegriff ist.";
  const user = `Fachrichtung: ${label}\nfalsch: "${falsch}"\nrichtig: "${richtig}"`;
  try {
    const r = await chat(
      [{ role: "system", content: sys }, { role: "user", content: user }],
      { baseUrl: strong.base, model: strong.model, temperature: 0, maxTokens: 40, timeoutMs: 15000 },
    );
    if (!r.ok) return false;
    const m = /\{[\s\S]*\}/.exec(r.text || "");
    if (!m) return false;
    return JSON.parse(m[0])?.ok === true;
  } catch { return false; }
}

// ── Hauptlauf ────────────────────────────────────────────────────────────────
export async function runLenaLearnSweep(clientId, { maxLlm = MAX_LLM_PER_RUN } = {}) {
  const cid = String(clientId || "").trim();
  if (!cid) return { ok: false, reason: "no_client" };

  const curSnap = await cursorRef().get().catch(() => null);
  const cursor = (curSnap?.exists ? curSnap.data() : {}) || {};
  const since = Number(cursor[cid] || 0);

  const q = await admin.firestore().collection("clients").doc(cid).collection("lenaCorrections")
    .where("createdAtMs", ">", since).orderBy("createdAtMs", "asc").limit(MAX_DOCS_PER_RUN)
    .get().catch(() => null);
  if (!q || q.empty) return { ok: true, processed: 0, promoted: 0 };

  // 1) Kandidaten je Fachrichtung sammeln.
  const bySpec = new Map(); // spec -> Map(key -> {falsch,richtig,count})
  let maxMs = since;
  for (const doc of q.docs) {
    const d = doc.data() || {};
    maxMs = Math.max(maxMs, Number(d.createdAtMs || 0));
    const spec = resolveSpec(d.specialty || "");
    if (!bySpec.has(spec)) bySpec.set(spec, new Map());
    const bucket = bySpec.get(spec);
    for (const p of wordDiffPairs(d.from, d.to)) {
      const key = `${norm(p.falsch)}|${norm(p.richtig)}`;
      const cur = bucket.get(key) || { falsch: p.falsch, richtig: p.richtig, count: 0 };
      cur.count += 1;
      bucket.set(key, cur);
    }
  }

  // 2) Pending mergen + 3) promoten.
  let promoted = 0;
  const promotedList = [];
  let llmBudget = maxLlm;
  for (const [spec, bucket] of bySpec) {
    const sSnap = await stateRef(spec).get().catch(() => null);
    const pending = (sSnap?.exists ? sSnap.data()?.pending : null) || {};
    for (const [key, c] of bucket) {
      const p = pending[key] || { falsch: c.falsch, richtig: c.richtig, count: 0, firstMs: Date.now() };
      p.count += c.count; p.lastMs = Date.now(); p.falsch = c.falsch; p.richtig = c.richtig;
      pending[key] = p;
    }

    const baseMap = (() => { try { return buildCorrectionMap(spec); } catch { return {}; } })();
    const label = (() => { try { return loadKb(spec)?.meta?.label || spec; } catch { return spec; } })();
    const ovSnap = await overlayRef(spec).get().catch(() => null);
    const overlay = (ovSnap?.exists ? ovSnap.data() : null) || { verhoerungen: [], begriffe: [] };
    const ovKeys = new Set((overlay.verhoerungen || []).map((v) => norm(v.falsch)));

    for (const [key, p] of Object.entries(pending)) {
      if (llmBudget <= 0) break;
      if (p.count < MIN_COUNT) continue;
      if (ovKeys.has(norm(p.falsch))) { delete pending[key]; continue; }
      if (!gateOk(p.falsch, p.richtig, baseMap)) { delete pending[key]; continue; } // dauerhaft verworfen
      llmBudget -= 1;
      const ok = await llmValidate(label, p.falsch, p.richtig);
      if (!ok) { delete pending[key]; continue; }
      overlay.verhoerungen = overlay.verhoerungen || [];
      overlay.verhoerungen.unshift({ falsch: p.falsch, richtig: p.richtig, count: p.count, lastMs: Date.now() });
      if (overlay.verhoerungen.length > MAX_OVERLAY) overlay.verhoerungen.length = MAX_OVERLAY;
      overlay.begriffe = Array.from(new Set([...(overlay.begriffe || []), p.richtig])).slice(0, MAX_OVERLAY);
      ovKeys.add(norm(p.falsch));
      delete pending[key];
      promoted += 1;
      promotedList.push({ spec, falsch: p.falsch, richtig: p.richtig, count: p.count });
    }

    await stateRef(spec).set({ pending, updatedAtMs: Date.now() }, { merge: true });
    if (promotedList.some((x) => x.spec === spec)) {
      overlay.spec = spec;
      overlay.promotedCount = (overlay.verhoerungen || []).length;
      overlay.updatedAtMs = Date.now();
      await overlayRef(spec).set(overlay, { merge: true });
      _ovCache.delete(spec);
    }
  }

  await cursorRef().set({ [cid]: maxMs }, { merge: true });
  return { ok: true, processed: q.size, promoted, promotedList };
}
