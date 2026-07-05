import { listCases } from "./caseStore.js";
import { queryLatest, queryByPatient } from "./eventStore.js";
import { applyHumanReview } from "./events.js";
import { TOPIC_LABELS, isActiveStatus } from "./cases.js";
import { searchPatient } from "../clara/agentBooking.js";
import { chat, llmInfo } from "../mail/llm.js";

// ============================================================================
// Gedaechtnis-Suche (W-SUCHE, 05.07.2026) — Google-artige UNIVERSAL-Suche.
//
// DREI Trefferarten (Erweiterung 05.07. nach Chef-Befund "Sablon = 0 Treffer"):
//   patient — Treffer in der Patienten-DB der Plattform -> Karteikarte
//   case    — Vorgang (Thread pro Person+Thema)
//   event   — einzelnes Ereignis (Anruf/Mail/Brief/Doku), auch OHNE Vorgang
//
// Rein additiv, ohne Volltext-Index: In-Memory-Scan ueber Cases (listCases)
// + die NEUESTEN Ereignisse im Fenster (queryLatest) + Patienten-Suche
// (masSearchPatients-CF). Ranking nach Feldgewicht + Boosts (offen,
// ueberfaellige Frist, Aktualitaet). Bei Pilot-Datenvolumen schnell genug.
// ============================================================================

const CHANNEL_LABELS = {
  bianca_call: "Anruf (Bianca)",
  lisa_call: "Anruf (Lisa)",
  lisa_sms: "SMS",
  nadine_email: "E-Mail",
  nadine_letter: "Brief",
  clara_voice: "Clara",
  lena_doc: "Behandlungsdoku",
  frontdesk: "Empfang",
  system: "System",
};

// Laengen-erhaltende Faltung (deutsch): klein + Umlaute/ß auf Einzelzeichen.
// Bewusst OHNE NFD, damit Snippet-Positionen 1:1 zum Originaltext passen.
function fold(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "s");
}

function tokenize(q) {
  return fold(q)
    .split(/[^a-z0-9@.]+/)
    .map((t) => t.trim().replace(/^[.@]+|[.@]+$/g, ""))
    .filter((t) => t.length >= 2);
}

function countOcc(hay, tok) {
  if (!hay || !tok) return 0;
  let i = 0;
  let c = 0;
  while ((i = hay.indexOf(tok, i)) !== -1) {
    c += 1;
    i += tok.length;
  }
  return c;
}

function tsToMs(v) {
  return v?.toMillis?.() ?? (typeof v === "number" ? v : 0);
}

// "1960-07-27" -> "27.07.1960" (Anzeige); alles andere unveraendert.
function fmtIsoDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "").trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(s || "").trim();
}

// Passage rund um den ersten Treffer (Google-Snippet). Gibt Originaltext
// zurueck (Highlight macht das Frontend), auf ~240 Zeichen beschnitten.
function makeSnippet(text, tokens) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const f = fold(raw);
  let pos = -1;
  for (const tok of tokens) {
    const p = f.indexOf(tok);
    if (p !== -1 && (pos === -1 || p < pos)) pos = p;
  }
  if (pos === -1) return raw.length > 240 ? `${raw.slice(0, 240).trim()}…` : raw;
  const start = Math.max(0, pos - 70);
  const end = Math.min(raw.length, pos + 180);
  return `${start > 0 ? "…" : ""}${raw.slice(start, end).trim()}${end < raw.length ? "…" : ""}`;
}

/**
 * Universal-Suche. Liefert eine gemischte, gerankte Trefferliste + Facetten.
 *
 * @param {string} clientId
 * @param {object} opts
 * @param {string} [opts.q]        Suchbegriff (leer = letzte Vorgaenge)
 * @param {string} [opts.kind]     "patient" | "case" | "event" (leer = alle)
 * @param {string} [opts.status]   "open" | "done" | konkreter Case-Status
 * @param {string} [opts.topic]    Themen-Key (billing, appointment, …)
 * @param {string} [opts.channel]  Kanal-Key (nadine_email, bianca_call, …)
 * @param {string} [opts.assignee] Zustaendig (nadine/lisa/team/…)
 * @param {number} [opts.sinceDays] Ereignis-Fenster in Tagen (Default 400)
 * @param {number} [opts.limit]    max. Ergebnisse (Default 40, Max 100)
 */
export async function searchBrain(clientId, opts = {}) {
  const q = String(opts.q || "").trim();
  const tokens = tokenize(q);
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 40));
  const sinceDays = Math.max(1, Math.min(1000, Number(opts.sinceDays) || 400));
  const sinceTs = Date.now() - sinceDays * 24 * 3_600_000;
  const now = Date.now();

  const [cases, events, patientsRes] = await Promise.all([
    listCases(clientId, { limit: 300 }).catch(() => []),
    queryLatest(clientId, sinceTs, 2000).catch(() => []),
    tokens.length ? searchPatient(clientId, q).catch(() => null) : Promise.resolve(null),
  ]);
  const evById = new Map(events.map((e) => [e.id, e]));

  // Ereignis -> Vorgang (fuer "gehoert zu"-Links auf Event-Treffern).
  const caseIdByEvent = new Map();
  for (const c of cases) {
    for (const eid of (Array.isArray(c.eventIds) ? c.eventIds : [])) {
      if (!caseIdByEvent.has(eid)) caseIdByEvent.set(eid, c.id);
    }
  }

  const hits = [];

  // ---- 1) Vorgaenge (Cases) ------------------------------------------------
  const matchedCaseEventIds = new Set();
  for (const c of cases) {
    const linked = (Array.isArray(c.eventIds) ? c.eventIds : [])
      .map((id) => evById.get(id))
      .filter(Boolean);

    const summaries = linked.map((e) => e.summary || "").join(" \n ");
    const updateText = (Array.isArray(c.updates) ? c.updates : []).map((u) => u.text || "").join(" \n ");
    const topicLabel = TOPIC_LABELS[c.topic] || c.topic || "";
    const name = c.subject?.name || "";

    const fTitle = fold(c.title || "");
    const fName = fold(name);
    const fTopic = fold(`${topicLabel} ${c.topic || ""}`);
    const fAssignee = fold(c.assignee || "");
    const fSummaries = fold(summaries);
    const fUpdates = fold(updateText);

    // Textmatch: alle Tokens muessen irgendwo vorkommen (UND, wie eine Suche).
    let score = 0;
    if (tokens.length) {
      const haystack = `${fTitle} ${fName} ${fTopic} ${fAssignee} ${fSummaries} ${fUpdates}`;
      if (!tokens.every((t) => haystack.includes(t))) continue;
      for (const t of tokens) {
        score += 6 * countOcc(fTitle, t)
          + 6 * countOcc(fName, t)
          + 3 * countOcc(fTopic, t)
          + 2 * countOcc(fAssignee, t)
          + 2 * countOcc(fSummaries, t)
          + 1 * countOcc(fUpdates, t);
      }
    }

    // Frist / Kanaele aus den (im Fenster geladenen) Ereignissen — best effort.
    let deadlineMs = null;
    const channelsSet = new Set();
    for (const e of linked) {
      if (e.channel) channelsSet.add(e.channel);
      if (e.deadlineMs && e.status !== "resolved") {
        deadlineMs = deadlineMs == null ? e.deadlineMs : Math.min(deadlineMs, e.deadlineMs);
      }
    }
    const active = isActiveStatus(c.status);
    const overdue = !!(deadlineMs && deadlineMs < now && active);
    const lastContactAt = Number(c.lastContactAt) || tsToMs(c.updatedAt);

    if (tokens.length) {
      if (active) score += 5;
      if (overdue) score += 8;
      const ageDays = (now - lastContactAt) / (24 * 3_600_000);
      if (ageDays <= 7) score += 4;
      else if (ageDays <= 30) score += 2;
      score += Math.min(Number(c.contactCount) || 0, 5);
      for (const eid of (Array.isArray(c.eventIds) ? c.eventIds : [])) matchedCaseEventIds.add(eid);
    }

    // Snippet: juengstes passendes Ereignis, sonst passende Notiz, sonst Neuestes.
    let snippetText = "";
    if (tokens.length) {
      const matchEv = linked
        .filter((e) => tokens.some((t) => fold(e.summary || "").includes(t)))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      if (matchEv) snippetText = matchEv.summary;
      if (!snippetText) {
        const mu = (Array.isArray(c.updates) ? c.updates : [])
          .filter((u) => tokens.some((t) => fold(u.text || "").includes(t)))
          .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
        if (mu) snippetText = mu.text;
      }
    }
    if (!snippetText) {
      const latest = linked.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      snippetText = latest?.summary
        || (Array.isArray(c.updates) ? c.updates.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0]?.text : "")
        || c.title
        || "";
    }

    hits.push({
      kind: "case",
      id: c.id,
      title: c.title || "Vorgang",
      topic: c.topic || "other",
      topicLabel,
      status: c.status,
      isActive: active,
      priority: c.priority || "normal",
      assignee: c.assignee || null,
      subjectName: name,
      matchStatus: c.subject?.matchStatus || "",
      patientId: c.subject?.patientId || null,
      contactCount: Number(c.contactCount) || 0,
      eventCount: Array.isArray(c.eventIds) ? c.eventIds.length : 0,
      lastContactAt,
      updatedAtMs: tsToMs(c.updatedAt),
      channels: [...channelsSet],
      deadlineMs,
      overdue,
      score,
      snippet: makeSnippet(snippetText, tokens),
    });
  }

  // ---- 2) Einzel-Ereignisse (auch ohne Vorgang) ------------------------------
  // Nur mit Suchbegriff (die Startseite zeigt letzte Vorgaenge). Ereignisse, die
  // schon in einem GETROFFENEN Vorgang stecken, nicht doppelt listen. Interne
  // Erledigt-Audit-Notizen (resolvesEventId) sind Verwaltungsrauschen.
  if (tokens.length) {
    for (const e of events) {
      if (e.resolvesEventId) continue;
      if (matchedCaseEventIds.has(e.id)) continue;
      const merged = applyHumanReview(e);
      const hayParts = [
        merged.summary,
        merged.counterparty?.name,
        merged.counterparty?.ref,
        merged.subject?.name,
        Array.isArray(merged.tags) ? merged.tags.join(" ") : "",
        CHANNEL_LABELS[merged.channel] || merged.channel,
      ];
      const hay = fold(hayParts.join(" \n "));
      if (!tokens.every((t) => hay.includes(t))) continue;

      let score = 0;
      const fWho = fold(`${merged.counterparty?.name || ""} ${merged.subject?.name || ""}`);
      const fSum = fold(merged.summary || "");
      for (const t of tokens) {
        score += 5 * countOcc(fWho, t) + 2 * countOcc(fSum, t);
      }
      if (merged.status === "open") score += 5;
      if (merged.deadlineMs && merged.deadlineMs < now && merged.status === "open") score += 8;
      const ageDays = (now - (merged.ts || 0)) / (24 * 3_600_000);
      if (ageDays <= 7) score += 4;
      else if (ageDays <= 30) score += 2;

      // Titel: "E-Mail von X" / "Anruf an Y" — Gegenstelle nur, wenn sie etwas
      // hinzufuegt (nicht der Kanalname selbst, z. B. "Clara von Clara").
      const chLabel = CHANNEL_LABELS[merged.channel] || merged.channel;
      const who = String(merged.counterparty?.name || "").trim();
      const whoUseful = who && fold(chLabel).indexOf(fold(who)) === -1;
      hits.push({
        kind: "event",
        id: merged.id,
        title: `${chLabel}${whoUseful ? ` ${merged.direction === "out" ? "an" : "von"} ${who}` : ""}`,
        channel: merged.channel,
        direction: merged.direction,
        ts: merged.ts || 0,
        status: merged.status || "none",
        isActive: merged.status === "open",
        subjectName: merged.subject?.name || "",
        patientId: merged.subject?.patientId || null,
        counterpartyName: merged.counterparty?.name || "",
        caseId: caseIdByEvent.get(merged.id) || null,
        deadlineMs: merged.deadlineMs || null,
        overdue: !!(merged.deadlineMs && merged.deadlineMs < now && merged.status === "open"),
        lastContactAt: merged.ts || 0,
        score,
        snippet: makeSnippet(merged.summary, tokens),
      });
    }
  }

  // ---- 3) Patienten (Karteikarte) -------------------------------------------
  // Treffer aus der Plattform-Patienten-DB. Angereichert mit Gedaechtnis-
  // Zaehlern (best effort, nur fuer die ersten 5).
  if (patientsRes?.ok && Array.isArray(patientsRes.patients) && patientsRes.patients.length) {
    const top = patientsRes.patients.slice(0, 5);
    const enrich = await Promise.all(top.map(async (p) => {
      try {
        const [evs, pcases] = await Promise.all([
          queryByPatient(clientId, p.id, 100),
          listCases(clientId, { patientId: p.id, limit: 50 }),
        ]);
        return { eventCount: evs.length, caseCount: pcases.length, activeCaseCount: pcases.filter((c) => isActiveStatus(c.status)).length };
      } catch {
        return { eventCount: 0, caseCount: 0, activeCaseCount: 0 };
      }
    }));
    top.forEach((p, i) => {
      const name = `${p.firstName || ""} ${p.lastName || ""}`.trim() || "Patient";
      const info = enrich[i] || { eventCount: 0, caseCount: 0, activeCaseCount: 0 };
      const geb = fmtIsoDay(p.birthDate);
      const bits = [
        info.eventCount ? `${info.eventCount} Einträge im Gedächtnis` : "noch keine Gedächtnis-Einträge",
        info.activeCaseCount ? (info.activeCaseCount === 1 ? "1 offener Vorgang" : `${info.activeCaseCount} offene Vorgänge`) : "",
        geb ? `geb. ${geb}` : "",
      ].filter(Boolean);
      hits.push({
        kind: "patient",
        id: p.id,
        title: name,
        patientId: p.id,
        firstName: p.firstName || "",
        lastName: p.lastName || "",
        birthDate: geb || null,
        hasPhone: !!p.hasPhone,
        eventCount: info.eventCount,
        caseCount: info.caseCount,
        activeCaseCount: info.activeCaseCount,
        isActive: info.activeCaseCount > 0,
        lastContactAt: 0,
        score: 100, // Karteikarten immer oben — die DB hat den Namen bestaetigt.
        snippet: `Karteikarte · ${bits.join(" · ")}`,
      });
    });
  }

  // Facetten ueber die volle Treffermenge (vor den Filtern).
  const facets = buildFacets(hits);

  // Filter anwenden.
  let filtered = hits;
  const fKind = (opts.kind || "").trim().toLowerCase();
  if (fKind) filtered = filtered.filter((r) => r.kind === fKind);
  const fStatus = (opts.status || "").trim().toLowerCase();
  if (fStatus === "open") filtered = filtered.filter((r) => r.kind !== "patient" && r.isActive);
  else if (fStatus === "done") filtered = filtered.filter((r) => r.kind !== "patient" && !r.isActive);
  else if (fStatus) filtered = filtered.filter((r) => r.kind === "case" && r.status === fStatus);
  const fTopic = (opts.topic || "").trim();
  if (fTopic) filtered = filtered.filter((r) => r.kind === "case" && r.topic === fTopic);
  const fChannel = (opts.channel || "").trim();
  if (fChannel) {
    filtered = filtered.filter((r) =>
      r.kind === "case" ? (r.channels || []).includes(fChannel)
        : r.kind === "event" ? r.channel === fChannel
          : false);
  }
  const fAssignee = (opts.assignee || "").trim().toLowerCase();
  if (fAssignee) filtered = filtered.filter((r) => r.kind === "case" && String(r.assignee || "").toLowerCase() === fAssignee);

  // Sortierung (Chef-Vorgabe 05.07.): CHRONOLOGISCH, neueste zuerst — nur die
  // Patienten-Karteikarten stehen immer oben (die DB hat den Namen bestaetigt).
  // Der Score bleibt Tiebreaker bei gleichem Zeitstempel.
  const when = (r) => r.lastContactAt || r.ts || r.updatedAtMs || 0;
  filtered.sort((a, b) => {
    const ap = a.kind === "patient" ? 1 : 0;
    const bp = b.kind === "patient" ? 1 : 0;
    if (ap !== bp) return bp - ap;
    if (ap && bp) return b.score - a.score;
    return (when(b) - when(a)) || (b.score - a.score);
  });

  return {
    count: filtered.length,
    results: filtered.slice(0, limit),
    facets,
    query: q,
    tokens,
  };
}

function buildFacets(hits) {
  const kinds = [
    { key: "patient", label: "Patienten", count: hits.filter((r) => r.kind === "patient").length },
    { key: "case", label: "Vorgänge", count: hits.filter((r) => r.kind === "case").length },
    { key: "event", label: "Ereignisse", count: hits.filter((r) => r.kind === "event").length },
  ].filter((f) => f.count > 0);

  const nonPatient = hits.filter((r) => r.kind !== "patient");
  const status = [
    { key: "open", label: "Offen", count: nonPatient.filter((r) => r.isActive).length },
    { key: "done", label: "Erledigt", count: nonPatient.filter((r) => !r.isActive).length },
  ].filter((f) => f.count > 0);

  const topicMap = new Map();
  const channelMap = new Map();
  const assigneeMap = new Map();
  for (const r of hits) {
    if (r.kind === "case") {
      if (r.topic) topicMap.set(r.topic, (topicMap.get(r.topic) || 0) + 1);
      for (const ch of (r.channels || [])) channelMap.set(ch, (channelMap.get(ch) || 0) + 1);
      if (r.assignee) {
        const key = String(r.assignee).toLowerCase();
        if (!assigneeMap.has(key)) assigneeMap.set(key, { label: r.assignee, count: 0 });
        assigneeMap.get(key).count += 1;
      }
    } else if (r.kind === "event" && r.channel) {
      channelMap.set(r.channel, (channelMap.get(r.channel) || 0) + 1);
    }
  }
  const topic = [...topicMap.entries()]
    .map(([key, count]) => ({ key, label: TOPIC_LABELS[key] || key, count }))
    .sort((a, b) => b.count - a.count);
  const channel = [...channelMap.entries()]
    .map(([key, count]) => ({ key, label: CHANNEL_LABELS[key] || key, count }))
    .sort((a, b) => b.count - a.count);
  const assignee = [...assigneeMap.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return { kind: kinds, status, topic, channel, assignee };
}

/**
 * KI-Modus (Chef-Wunsch 05.07.: "wie bei Google Search"): beantwortet die
 * Suchfrage in Saetzen — NUR aus den eigenen Suchtreffern (kein Weltwissen,
 * nichts erfinden), ueber das LOKALE LLM (gleiche Engine wie Nadine, DSGVO:
 * Patientendaten verlassen das Praxisnetz nicht). Liefert Antwort + die
 * verwendeten Fundstellen (Quellen), damit das Frontend sie verlinken kann.
 */
// Fuellwoerter natuerlicher Fragen ("Was ist mit der ...?") — fuer die
// Fundstellen-Suche irrelevant und toedlich fuer die UND-Logik.
const QUESTION_STOPWORDS = new Set([
  "was", "ist", "sind", "war", "waren", "mit", "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer",
  "wie", "wer", "wen", "wem", "wann", "wo", "warum", "wieso", "weshalb", "welche", "welcher", "welches", "wurde", "worden",
  "hat", "habe", "haben", "hatte", "gibt", "gab", "geht", "ging", "steht", "stand", "kam", "kommt", "lief", "laeuft", "lauft",
  "es", "wir", "ich", "uns", "mir", "mich", "man", "sich", "sie", "er", "ihm", "ihr", "und", "oder", "aber", "auch", "noch",
  "schon", "mal", "denn", "eigentlich", "bitte", "gerade", "aktuell", "neues", "los", "fuer", "fur", "von", "vom", "zu", "zum",
  "zur", "im", "in", "am", "an", "auf", "um", "bei", "beim", "aus", "nach", "ueber", "uber", "unter", "unser", "unsere",
  "unserer", "unserem", "unseren", "meine", "meiner", "meinem", "meinen", "sache", "thema", "stand", "dazu", "da", "dort", "hier",
]);

export async function answerBrain(clientId, { q, sinceDays } = {}) {
  const query = String(q || "").trim();
  if (!query) return { ok: false, reason: "empty_query" };

  // 1) Stichwoerter aus der Frage ziehen (Fuellwoerter raus).
  const keywords = tokenize(query).filter((t) => t.length >= 3 && !QUESTION_STOPWORDS.has(t));
  const kwQuery = keywords.join(" ");

  // 2) Suche: erst alle Stichwoerter (UND); wenn leer, jedes Stichwort einzeln
  //    und zusammenfuehren; ganz ohne Stichwoerter ("Was gibt es Neues?") die
  //    juengsten Eintraege — die KI fasst dann den aktuellen Stand zusammen.
  let hits = [];
  if (kwQuery) {
    hits = (await searchBrain(clientId, { q: kwQuery, sinceDays, limit: 12 })).results || [];
    if (!hits.length && keywords.length > 1) {
      const seen = new Set();
      for (const kw of keywords.slice(0, 5)) {
        const part = (await searchBrain(clientId, { q: kw, sinceDays, limit: 6 })).results || [];
        for (const h of part) {
          const key = `${h.kind}:${h.id}`;
          if (!seen.has(key)) { seen.add(key); hits.push(h); }
        }
      }
      hits.sort((a, b) => ((b.lastContactAt || b.ts || 0) - (a.lastContactAt || a.ts || 0)));
      hits = hits.slice(0, 12);
    }
  } else {
    hits = (await searchBrain(clientId, { sinceDays, limit: 12 })).results || [];
  }

  if (!hits.length) {
    return { ok: true, answer: "Dazu findet sich nichts im Praxisgedächtnis — kein Treffer bei Patienten, Vorgängen oder Ereignissen.", sources: [], model: llmInfo().model, hitCount: 0 };
  }

  const fmtD = (ms) => (ms ? new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "");
  const lines = hits.map((h, i) => {
    const art = h.kind === "patient"
      ? `Patient (Karteikarte${h.birthDate ? `, geb. ${h.birthDate}` : ""})`
      : h.kind === "case"
        ? `Vorgang „${h.topicLabel || h.topic}“, ${h.isActive ? "offen" : "erledigt"}${h.assignee ? `, liegt bei ${h.assignee}` : ""}`
        : `Ereignis (${CHANNEL_LABELS[h.channel] || h.channel})`;
    const when = fmtD(h.lastContactAt || h.ts);
    return `[${i + 1}] ${art}${when ? `, ${when}` : ""}: ${h.title}${h.snippet ? ` — ${h.snippet}` : ""}`;
  });

  const messages = [
    {
      role: "system",
      content: [
        "Du bist MSS, die interne Suche einer Arztpraxis, und antwortest dem Praxisteam.",
        "Antworte AUSSCHLIESSLICH aus den nummerierten Fundstellen — nichts erfinden, kein Weltwissen.",
        "Kurz und konkret auf Deutsch: 2 bis 6 Sätze; bei mehreren Punkten eine Stichpunktliste mit Datum.",
        "Belege Aussagen mit den Fundstellen-Nummern in eckigen Klammern, z. B. [1] oder [2][3].",
        "Wenn die Fundstellen die Frage nicht beantworten, sage das ehrlich und schlage einen besseren Suchbegriff vor.",
      ].join(" "),
    },
    { role: "user", content: `Frage: ${query}\n\nFundstellen aus dem Praxisgedächtnis:\n${lines.join("\n")}` },
  ];

  const out = await chat(messages, { temperature: 0.2, maxTokens: 550, timeoutMs: 60000 });
  if (!out.ok) {
    return { ok: false, reason: out.reason || "llm_error", model: out.model, sources: hits, hitCount: hits.length };
  }
  return { ok: true, answer: out.text, model: out.model, sources: hits, hitCount: hits.length };
}

/**
 * Karteikarte: ALLES aus dem Gedaechtnis zu EINEM Patienten — Ereignisse
 * (Anrufe, Mails, Briefe, Doku) + Vorgaenge. Findet auch Eintraege, die nur
 * ueber den NAMEN zugeordnet sind (unmatched, kein patientId-Link), solange
 * ALLE Namens-Tokens vorkommen (nie nur der Nachname-Teiltreffer eines
 * anderen Patienten).
 *
 * @param {string} clientId
 * @param {{patientId?:string, name?:string, sinceDays?:number}} opts
 */
export async function buildKarteikarte(clientId, { patientId, name, sinceDays } = {}) {
  const pid = String(patientId || "").trim();
  const nameTokens = tokenize(name || "");
  const windowDays = Math.max(1, Math.min(1000, Number(sinceDays) || 400));
  const sinceTs = Date.now() - windowDays * 24 * 3_600_000;

  const [byPid, windowEvents, casesByPid, allCases] = await Promise.all([
    pid ? queryByPatient(clientId, pid, 300).catch(() => []) : Promise.resolve([]),
    queryLatest(clientId, sinceTs, 2000).catch(() => []),
    pid ? listCases(clientId, { patientId: pid, limit: 100 }).catch(() => []) : Promise.resolve([]),
    listCases(clientId, { limit: 300 }).catch(() => []),
  ]);

  const matchName = (s) => {
    if (!nameTokens.length) return false;
    const f = fold(s || "");
    return f.length > 0 && nameTokens.every((t) => f.includes(t));
  };

  const evMap = new Map();
  for (const e of byPid) evMap.set(e.id, e);
  for (const e of windowEvents) {
    if (evMap.has(e.id)) continue;
    if ((pid && e.subject?.patientId === pid) || matchName(e.subject?.name) || matchName(e.counterparty?.name)) {
      evMap.set(e.id, e);
    }
  }
  const events = [...evMap.values()].map(applyHumanReview).sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const caseMap = new Map();
  for (const c of casesByPid) caseMap.set(c.id, c);
  for (const c of allCases) {
    if (caseMap.has(c.id)) continue;
    if ((pid && c.subject?.patientId === pid) || matchName(c.subject?.name)) caseMap.set(c.id, c);
  }
  const ms = (v) => v?.toMillis?.() ?? (typeof v === "number" ? v : 0);
  const cases = [...caseMap.values()].sort((a, b) => {
    const aa = isActiveStatus(a.status) ? 1 : 0;
    const bb = isActiveStatus(b.status) ? 1 : 0;
    if (aa !== bb) return bb - aa; // aktive zuerst
    return (Number(b.lastContactAt) || ms(b.updatedAt)) - (Number(a.lastContactAt) || ms(a.updatedAt));
  });

  return { events, cases };
}
