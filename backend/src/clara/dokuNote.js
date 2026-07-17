import admin from "../firebase.js";
import { chat } from "../mail/llm.js";
import { writeTreatmentSummaryEvent } from "./treatmentDoc.js";

// ============================================================================
// Auto-Karteikarte (04.07.2026): Nach jedem Diktat / Streichen baut MAS aus
// allen AKTIVEN Segmenten des Termins EINE strukturierte Karteikarte und
// schreibt sie dorthin, wo Termintab + Lena-Seite ohnehin mitlesen:
//   appointments/{id}/treatment/main  { structuredHtml, structuredText, ... }
//
// Das ist dieselbe Stelle, die die Cloud Function structureTreatmentNote
// (Frontend-Button, gpt-4o) beschreibt — wir setzen dieselben Felder, nur mit
// dem LOKALEN Modell (DSGVO: Patiententext verlaesst das Praxisnetz nicht).
// Der Button funktioniert weiter und darf unsere Version ueberschreiben.
//
// Laeuft IMMER fire-and-forget (setImmediate im Aufrufer): Claras gesprochene
// Bestaetigung wartet nie auf die Karteikarte.
// ============================================================================

function stripDangerousHtml(html) {
  return String(html || "")
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/ on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/ on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .slice(0, 40000);
}

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

/** Minimal-HTML aus Klartext, falls das Modell kein brauchbares HTML liefert. */
function textZuHtml(plain) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return String(plain || "")
    .split(/\n{2,}/)
    .map((absatz) => `<p>${esc(absatz.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/**
 * Karteikarte des Termins aus dem kumulierten Diktat-Text neu bauen.
 * Best-effort: LLM tot => Klartext-Fallback (Segmente unveraendert gereiht),
 * damit die Kartei nie leerer wird, als die Diktate hergeben.
 *
 * @param {string} clientId
 * @param {{locationId:string, appointmentId:string, combinedText:string,
 *          motiveName?:string, segmentsCount?:number}} args
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function strukturiereKarteikarte(clientId, { locationId, appointmentId, combinedText, motiveName = "", segmentsCount = 0 } = {}) {
  if (!clientId || !locationId || !appointmentId) return { ok: false, reason: "missing_ids" };

  const ref = admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(appointmentId)
    .collection("treatment").doc("main");

  const quelle = String(combinedText || "").trim();

  // Alles gestrichen => Karteikarte leeren (die gestrichenen Segmente bleiben
  // durchgestrichen in der Segment-Timeline sichtbar, § 630f).
  if (!quelle) {
    try {
      await ref.set({
        structuredHtml: "",
        structuredText: "",
        segmentsCount: 0,
        model: "clara-auto",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "clara-auto",
      }, { merge: true });
      // Leere Kartei -> Summary-Event aus dem Shared Memory entfernen.
      await writeTreatmentSummaryEvent(clientId, { locationId, appointmentId, structuredText: "" });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  }

  let structuredText = "";
  let structuredHtml = "";

  const res = await chat([
    {
      role: "system",
      content: [
        "Du bist die Dokumentations-Assistenz einer Arztpraxis.",
        "Du erhaeltst Roh-Diktate zu EINEM Patiententermin (ggf. mehrere Aufnahmen, spaetere ergaenzen fruehere).",
        "Fuehre alles zu EINER sauberen Karteikarte zusammen, gegliedert nach: Anlass/Anamnese, Befund, Diagnose, Therapie/Massnahme, Aufklaerung, Komplikationen, Procedere — nur Abschnitte, zu denen etwas gesagt wurde.",
        "Korrigiere offensichtliche Diktier-/Transkriptionsfehler, behalte ALLE Fakten, erfinde NICHTS dazu.",
        "Zahnangaben, Werte, Materialien, Regionen exakt uebernehmen.",
        "Antworte NUR mit JSON: {\"html\": string, \"plain\": string}.",
        "html: schlichtes HTML (h4 Ueberschriften, ul/li, p) ohne script/style/Inline-Styles.",
        "plain: dieselbe Karteikarte als reiner Text mit Zeilenumbruechen.",
        "Sprache: Deutsch.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        motiveName ? `Terminart: ${motiveName}` : "",
        `Roh-Diktate:\n${quelle.slice(0, 6000)}`,
      ].filter(Boolean).join("\n\n"),
    },
  ], { temperature: 0.2, maxTokens: 1200, timeoutMs: 60000 });

  if (res.ok) {
    const parsed = extractJson(res.text) || {};
    structuredHtml = stripDangerousHtml(typeof parsed.html === "string" ? parsed.html : "");
    structuredText = typeof parsed.plain === "string" ? parsed.plain.slice(0, 40000) : "";
  }

  // Fallback: Modell nicht erreichbar / kein brauchbares JSON => Klartext.
  if (!structuredText && !structuredHtml) {
    structuredText = quelle.slice(0, 40000);
    structuredHtml = textZuHtml(structuredText);
  } else if (!structuredHtml) {
    structuredHtml = textZuHtml(structuredText);
  } else if (!structuredText) {
    structuredText = structuredHtml.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 40000);
  }

  try {
    await ref.set({
      structuredHtml,
      structuredText,
      segmentsCount: Number(segmentsCount) || 0,
      model: res.ok ? `clara-auto:${res.model}` : "clara-auto:fallback",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: "clara-auto",
    }, { merge: true });
    // Zusammenfassung ins geteilte Praxisgedaechtnis (auffindbar in MAS-Suche +
    // Patienten-Dossier). Best-effort — Karteikarte oben ist die fuehrende Quelle.
    await writeTreatmentSummaryEvent(clientId, { locationId, appointmentId, structuredText });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}
