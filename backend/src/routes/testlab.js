// Clara-Testlabor (/testlab/*) — W-LABOR, 27.07.2026.
//
// Bedient die Testseite (backend/public/clara-testlabor.html): Fragen einzeln
// oder gruppenweise durch die ECHTE Clara-Pipeline schicken, Antworten live
// anzeigen, pro Frage Befunde festhalten, Prompt und Tool-Beschreibungen
// bearbeiten - alles PRO MANDANT.
//
// Arbeitsteilung:
//   lab_server.py (Clara-Voice)  faehrt die Pipeline, kennt Profile + Katalog
//   testlab/client.js            reicht durch, streamt NDJSON weiter
//   testlab/store.js             speichert Basislinien + Befunde je Mandant
//   diese Datei                  Zugriff, Tenant, Zusammenfuehren
//
// Zugriff: NUR Superuser (oder Service-Token/Dev). Ein Lauf belegt GPU und
// Ollama und schreibt am Profil - das darf kein Praxis-Account ausloesen.
import express from "express";
import admin from "firebase-admin";
import { labFetch, labStream, labUrl } from "../testlab/client.js";
import {
  listLab, saveFinding, saveBaseline, clearBaseline, exportFindings,
  findingsToMarkdown, PROBLEM_KINDS, SEVERITIES,
} from "../testlab/store.js";
import { resolveClientId } from "./_shared.js";

const router = express.Router();

function requireSuperuser(req, res) {
  const a = req.auth || {};
  if (a.kind === "user" && !a.superUser) {
    res.status(403).json({ error: "superuser_only" });
    return false;
  }
  return true;
}

function actor(req) {
  const a = req.auth || {};
  return a.kind === "user" ? (a.name || a.email || a.userId || "Superuser") : "Service";
}

// Jede Route: Superuser pruefen, Mandant aufloesen, Fehler sprechend melden.
function lab(handler) {
  return async (req, res) => {
    if (!requireSuperuser(req, res)) return;
    try {
      const clientId = resolveClientId(req);
      if (!clientId) return res.status(400).json({ error: "client_id_required" });
      await handler(clientId, req, res);
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  };
}


// --- Lage: laeuft das Labor, gibt es fuer diesen Mandanten ein Profil? -----
router.get("/testlab/status", lab(async (clientId, req, res) => {
  let health = null;
  let error = "";
  try {
    health = await labFetch("/health", { timeoutMs: 4000 });
  } catch (e) {
    error = String(e?.message || e);
  }
  let profiles = [];
  if (health) {
    try {
      profiles = (await labFetch("/profiles", { timeoutMs: 4000 })).profiles || [];
    } catch { /* Liste ist Bonus */ }
  }
  const mine = profiles.find((p) => p.clientId === clientId) || null;
  res.json({
    ok: true,
    clientId,
    labUrl: labUrl(),
    online: !!health,
    error,
    health,
    profile: mine,
    hasProfile: !!mine,
    problemKinds: PROBLEM_KINDS,
    severities: SEVERITIES,
  });
}));


// --- Mandantenliste fuer die Auswahl oben (nur ausserhalb des Kunden-Tabs) --
router.get("/testlab/clients", lab(async (_clientId, req, res) => {
  const [snap, profiles] = await Promise.all([
    admin.firestore().collection("clients").orderBy("name").limit(500).get(),
    labFetch("/profiles", { timeoutMs: 4000 }).then((d) => d.profiles || []).catch(() => []),
  ]);
  const byClient = new Map(profiles.map((p) => [p.clientId, p]));
  const clients = snap.docs.map((d) => {
    const c = d.data() || {};
    const p = byClient.get(d.id) || null;
    return {
      id: d.id,
      name: String(c.name || d.id),
      isEnabled: c.isEnabled !== false,
      hasProfile: !!p,
      profileId: p?.profileId || "",
      calendars: p?.calendars || [],
    };
  });
  res.json({ ok: true, clients });
}));


// --- Katalog + gespeicherter Stand des Mandanten in EINER Antwort ----------
// Die Seite braucht beides zusammen: ohne Basislinien/Befunde kann sie die
// Fragen nicht richtig zeichnen, und zwei Rundreisen kosten nur Zeit.
router.get("/testlab/catalog", lab(async (clientId, req, res) => {
  const [catalog, stored] = await Promise.all([
    labFetch(`/catalog?clientId=${encodeURIComponent(clientId)}`),
    listLab(clientId).catch(() => ({})),
  ]);
  res.json({ ok: true, clientId, ...catalog, stored });
}));


// --- Eine Frage -----------------------------------------------------------
// Beim ERSTEN Durchlauf einer Frage wird der IST-Zustand automatisch
// eingefroren (Chef 27.07.: "default Ist-Zustand jetzt pro Frage"). Spaetere
// Laeufe lassen die Basislinie unangetastet - sie ist der Bezugspunkt.
router.post("/testlab/ask", lab(async (clientId, req, res) => {
  const body = req.body || {};
  const out = await labFetch("/ask", {
    method: "POST",
    body: { clientId, id: body.id || "", text: body.text || "" },
  });
  const r = out.result || {};

  let baseline = null;
  if (r.id) {
    try {
      const prompt = await labFetch(`/prompt?clientId=${encodeURIComponent(clientId)}`, { timeoutMs: 8000 });
      const toolDesc = (prompt.tools || []).find((t) => t.name === r.first_tool)?.description || "";
      const saved = await saveBaseline(clientId, r.id, {
        question: r.input,
        answer: r.final_response,
        tool: r.first_tool,
        toolArgs: r.first_args,
        pass: r.pass,
        fails: r.fails,
        totalMs: r.total_ms,
        model: r.model,
        promptChars: prompt.promptChars,
        toolDescription: toolDesc,
      }, { force: !!body.refreezeBaseline, by: actor(req) });
      baseline = saved.baseline;
    } catch { /* Basislinie ist Komfort, nie blockierend */ }
  }
  res.json({ ok: true, result: r, baseline });
}));


// --- Gruppe oder ganzer Katalog: Ergebnisse fliessen live zur Seite --------
router.post("/testlab/run", lab(async (clientId, req, res) => {
  const b = req.body || {};
  await labStream({
    clientId,
    ids: Array.isArray(b.ids) ? b.ids : [],
    groups: Array.isArray(b.groups) ? b.groups : [],
    categories: Array.isArray(b.categories) ? b.categories : [],
  }, res);
}));


router.post("/testlab/cancel", lab(async (_clientId, req, res) => {
  res.json(await labFetch("/cancel", { method: "POST", body: {}, timeoutMs: 5000 }));
}));


// --- Prompt & Tool-Beschreibungen (pro Mandant, versioniert per Git) -------
router.get("/testlab/prompt", lab(async (clientId, req, res) => {
  res.json(await labFetch(`/prompt?clientId=${encodeURIComponent(clientId)}`));
}));

router.put("/testlab/prompt", lab(async (clientId, req, res) => {
  const out = await labFetch("/prompt", {
    method: "PUT",
    body: { clientId, systemPrompt: String(req.body?.systemPrompt || ""), by: actor(req) },
  });
  res.json(out);
}));

router.put("/testlab/tool", lab(async (clientId, req, res) => {
  const out = await labFetch("/tool", {
    method: "PUT",
    body: {
      clientId,
      name: String(req.body?.name || ""),
      description: String(req.body?.description || ""),
      by: actor(req),
    },
  });
  res.json(out);
}));


// --- Befund zu einer Frage ------------------------------------------------
router.put("/testlab/finding", lab(async (clientId, req, res) => {
  const caseId = String(req.body?.caseId || "");
  res.json(await saveFinding(clientId, caseId, req.body || {}, actor(req)));
}));


// --- Basislinie: einfrieren / verwerfen / zuruecksetzen --------------------
router.post("/testlab/baseline", lab(async (clientId, req, res) => {
  const caseId = String(req.body?.caseId || "");
  res.json(await saveBaseline(clientId, caseId, req.body?.snapshot || {},
                              { force: true, by: actor(req) }));
}));

router.delete("/testlab/baseline", lab(async (clientId, req, res) => {
  res.json(await clearBaseline(clientId, String(req.query?.caseId || "")));
}));

/**
 * Auf den eingefrorenen Stand zurueck. Punktgenau: wiederhergestellt wird die
 * BESCHREIBUNG des Tools, das zu dieser Frage gehoert - nicht der ganze
 * Prompt. Der System-Prompt ist EINER fuer alle Fragen; ihn hier
 * zurueckzudrehen wuerde Verbesserungen an anderen Fragen mitreissen. Fuer den
 * Prompt gibt es die Git-Historie und den bewussten Griff im Editor.
 */
router.post("/testlab/reset", lab(async (clientId, req, res) => {
  const caseId = String(req.body?.caseId || "");
  const stored = await listLab(clientId);
  const baseline = stored[caseId]?.baseline;
  if (!baseline) throw new Error("Fuer diese Frage ist kein Ist-Zustand eingefroren.");
  const tool = String(baseline.tool || "");
  if (!tool || tool === "none") {
    throw new Error("Zu dieser Frage gehoert kein Tool - hier gibt es nichts punktgenau zurueckzusetzen.");
  }
  const out = await labFetch("/tool", {
    method: "PUT",
    body: {
      clientId, name: tool,
      description: String(baseline.toolDescription || ""),
      by: `${actor(req)} (Zuruecksetzen ${caseId})`,
    },
  });
  res.json({ ok: true, restored: tool, ...out });
}));


// --- Befunde herunterladen (JSON fuer die Fehlersuche, MD zum Lesen) -------
router.get("/testlab/export", lab(async (clientId, req, res) => {
  let meta = {};
  try {
    const h = await labFetch(`/prompt?clientId=${encodeURIComponent(clientId)}`, { timeoutMs: 6000 });
    meta = { profileId: h.profileId, model: (await labFetch("/health", { timeoutMs: 4000 })).model };
  } catch { /* Metadaten sind Bonus */ }

  const data = await exportFindings(clientId, meta);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
  if (String(req.query?.format || "json") === "md") {
    res.set("Content-Type", "text/markdown; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="clara-befunde-${stamp}.md"`);
    return res.send(findingsToMarkdown(data));
  }
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="clara-befunde-${stamp}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));


export default router;
