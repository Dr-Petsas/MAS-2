import { masCollection } from "../tenant.js";
import { appendEvent } from "./eventStore.js";
import { log } from "../log.js";

// ============================================================================
// DSGVO: KI-Ansage am Telefon — pro Agent ZUSCHALTBAR, Default AUS.
//
// O-Ton Chef: "ich will keine ansage des telefonisten bianca oder lisa in
// dieser richtung … solche ansagen sollen bestenfalls zuschaltbar bzw.
// abschaltbar sein." Also: kein hartkodierter Hinweis, sondern ein Schalter
// je Agent im Cockpit (mas_config/dsgvo).
//
// Wirkung OHNE Plattform-Deploy:
//   - Lisa (outbound): der Hinweis wird beim Anrufstart der task_prompt-
//     Anweisung vorangestellt (lisa/outbound.js liest die Config).
//   - Bianca (inbound): ihr Agent-Prompt enthält {{ai_disclosure}} (per
//     Patch-Skript ergänzt); dieser Schalter setzt den DEFAULT-Wert der
//     Dynamic Variable direkt am ElevenLabs-Agenten — Text oder leer.
//
// Jede Schalter-Änderung wird als System-Event im Brain festgehalten
// (Audit-Spur: wer hat wann welche Ansage an-/abgeschaltet).
// ============================================================================

const DOC_ID = "dsgvo";
export const DEFAULT_DISCLOSURE_TEXT =
  "Ein kurzer Hinweis vorab: Sie sprechen mit der digitalen Assistentin unserer Praxis.";

function configDoc(clientId) {
  return masCollection(clientId, "mas_config").doc(DOC_ID);
}

export async function getDsgvoConfig(clientId) {
  try {
    const snap = await configDoc(clientId).get();
    const d = snap.exists ? snap.data() : {};
    return {
      announceBianca: d?.announceBianca === true,
      announceLisa: d?.announceLisa === true,
      disclosureText: String(d?.disclosureText || "").trim() || DEFAULT_DISCLOSURE_TEXT,
      updatedAt: d?.updatedAt || null,
      updatedBy: d?.updatedBy || null,
    };
  } catch {
    return { announceBianca: false, announceLisa: false, disclosureText: DEFAULT_DISCLOSURE_TEXT, updatedAt: null, updatedBy: null };
  }
}

/**
 * Schalter setzen + sofort anwenden (Bianca: Default der Dynamic Variable am
 * ElevenLabs-Agenten; Lisa wirkt zur Laufzeit). Audit-Event inklusive.
 */
export async function setDsgvoConfig(clientId, patch = {}, { by = "" } = {}) {
  const prev = await getDsgvoConfig(clientId);
  const next = {
    announceBianca: typeof patch.announceBianca === "boolean" ? patch.announceBianca : prev.announceBianca,
    announceLisa: typeof patch.announceLisa === "boolean" ? patch.announceLisa : prev.announceLisa,
    disclosureText: (String(patch.disclosureText ?? "").trim() || prev.disclosureText).slice(0, 300),
    updatedAt: Date.now(),
    updatedBy: String(by || "").slice(0, 80) || null,
  };
  await configDoc(clientId).set(next, { merge: true });

  // Bianca: Default-Wert der ai_disclosure-Variable am Agenten setzen.
  let biancaApplied = null;
  if (next.announceBianca !== prev.announceBianca || next.disclosureText !== prev.disclosureText) {
    biancaApplied = await applyBiancaDisclosure(next).catch((e) => {
      log.warn("dsgvo.bianca_patch_failed", { clientId, error: String(e?.message || e) });
      return false;
    });
  }

  // Audit-Spur im Brain (System-Event, kein offenes Anliegen).
  const changes = [];
  if (next.announceBianca !== prev.announceBianca) changes.push(`Bianca-Ansage ${next.announceBianca ? "AN" : "AUS"}`);
  if (next.announceLisa !== prev.announceLisa) changes.push(`Lisa-Ansage ${next.announceLisa ? "AN" : "AUS"}`);
  if (changes.length) {
    await appendEvent(clientId, {
      channel: "system",
      direction: "internal",
      type: "note",
      counterparty: { kind: "system", name: by || "Cockpit" },
      summary: `DSGVO-Einstellung geändert: ${changes.join(", ")}${by ? ` (durch ${by})` : ""}.`,
      status: "none",
      extractor: "dsgvo@config",
      tags: ["dsgvo", "audit"],
    }).catch(() => {});
  }

  return { ...next, biancaApplied };
}

/** Hinweis-Satz für Lisas task_prompt (leer, wenn abgeschaltet). */
export async function lisaDisclosurePrefix(clientId) {
  const cfg = await getDsgvoConfig(clientId);
  if (!cfg.announceLisa) return "";
  return `WICHTIG: Beginne das Gespräch direkt nach der Begrüßung mit genau diesem Hinweis: "${cfg.disclosureText}" `;
}

// Default-Wert der Dynamic Variable ai_disclosure am Bianca-Agenten setzen.
// Der Prompt enthält {{ai_disclosure}} — leer heißt: kein Hinweis.
async function applyBiancaDisclosure(cfg) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.BIANCA_AGENT_ID;
  if (!apiKey || !agentId) return false;

  const base = `https://api.elevenlabs.io/v1/convai/agents/${agentId}`;
  const get = await fetch(base, { headers: { "xi-api-key": apiKey } });
  if (!get.ok) throw new Error(`elevenlabs_get_${get.status}`);
  const agent = await get.json();
  const placeholders = {
    ...(agent?.conversation_config?.agent?.dynamic_variables?.dynamic_variable_placeholders || {}),
    ai_disclosure: cfg.announceBianca ? cfg.disclosureText : "",
  };
  const patch = await fetch(base, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_config: { agent: { dynamic_variables: { dynamic_variable_placeholders: placeholders } } },
    }),
  });
  if (!patch.ok) throw new Error(`elevenlabs_patch_${patch.status}`);
  return true;
}
