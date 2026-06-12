import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { normalizePhoneE164 } from "../lisa/outbound.js";
import { upsertSharedContact } from "../brain/addressBook.js";
import { log } from "../log.js";

// ============================================================================
// Bianca — inbound telephonist (ElevenLabs ConvAI) -> shared brain.
//
// Bianca nimmt die Praxisanrufe als ConvAI-Agent bei ElevenLabs entgegen, lief
// aber bisher KOMPLETT am Praxisgedächtnis vorbei: kein bianca_call-Event, kein
// Heads-up für Clara, kein Kontext für Rückrufer. Dieses Modul schließt den
// Telefon-Loop (Jawdropper ①, Nacht 11./12.06.2026):
//
//   Poller (gleicher Takt wie finalizeLisaCalls):
//     1. Liste die letzten Conversations des Bianca-Agenten.
//     2. Für jede BEENDETE, noch nicht ingestete: Transkript holen und als
//        v5.2-Manifest an den eigenen /brain/ingest/transcript POSTen — der
//        deterministische Extraktor erzeugt daraus das attributierte
//        bianca_call-Event (deutsche Zusammenfassung, Signale, Patienten-
//        Matching, Fall-Verknüpfung). EIN Code-Pfad für alle Kanäle.
//     3. Cursor-Dokument je Conversation in mas_bianca_ingested — der
//        stabile Event-Id-Hash im Ingest-Endpoint dedupliziert zusätzlich.
//
// Konfiguration: BIANCA_AGENT_ID in backend/.env (gleiches ElevenLabs-Konto
// wie Lisa). Ohne die Variable ist der Poller ein No-op.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const INGESTED = "mas_bianca_ingested";

function ingestedCol(clientId) {
  return masCollection(clientId, INGESTED);
}

function env(name) {
  return (process.env[name] || "").trim();
}

export function biancaConfigured() {
  return !!(env("ELEVENLABS_API_KEY") && env("BIANCA_AGENT_ID"));
}

async function elevenGet(path) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    headers: { "xi-api-key": env("ELEVENLABS_API_KEY") },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail?.message || `elevenlabs_http_${r.status}`);
  return data;
}

// ConvAI-Transkript -> v5.2-Manifest, wie es der Clara-Voice-Worker postet.
// Rollen: ConvAI sagt "agent"/"user"; der Extraktor wertet die user-Turns aus.
function toManifest(conv) {
  const turns = (Array.isArray(conv?.transcript) ? conv.transcript : [])
    .map((m) => ({
      role: String(m.role || "").toLowerCase() === "user" ? "user" : "assistant",
      text: String(m.message || m.text || "").trim(),
    }))
    .filter((t) => t.text);
  return { turns, end_reason: String(conv?.metadata?.termination_reason || "") };
}

function callerPhoneOf(conv) {
  const pc = conv?.metadata?.phone_call || {};
  return normalizePhoneE164(pc.external_number || pc.caller_number || "") || "";
}

// Nur abgeschlossene Gespräche der letzten 48 h sind interessant — ältere sind
// beim ersten Lauf Bestandsdaten und würden das Briefing mit Uralt-Anrufen
// fluten.
const LOOKBACK_MS = 48 * 60 * 60 * 1000;

let ingestBusy = false;

/**
 * Poll the Bianca ConvAI agent and ingest finished conversations into the
 * shared brain. Safe on an interval — overlapping runs are skipped, every
 * conversation is ingested exactly once.
 */
export async function ingestBiancaCalls(clientId, { port } = {}) {
  if (ingestBusy || !biancaConfigured()) return { checked: 0, ingested: 0 };
  ingestBusy = true;
  try {
    const agentId = env("BIANCA_AGENT_ID");
    const list = await elevenGet(`/v1/convai/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=30`);
    const conversations = Array.isArray(list?.conversations) ? list.conversations : [];
    const cutoff = Date.now() - LOOKBACK_MS;
    let ingested = 0;
    let checked = 0;

    for (const c of conversations) {
      const convId = String(c?.conversation_id || "").trim();
      const status = String(c?.status || "").toLowerCase();
      const startedMs = Number(c?.start_time_unix_secs || 0) * 1000;
      if (!convId || !["done", "failed"].includes(status) || startedMs < cutoff) continue;

      checked += 1;
      const cursorRef = ingestedCol(clientId).doc(convId);
      if ((await cursorRef.get()).exists) continue;

      try {
        const conv = await elevenGet(`/v1/convai/conversations/${convId}`);
        const manifest = toManifest(conv);
        if (!manifest.turns.length) {
          // Leeres/abgebrochenes Gespräch: Cursor setzen, aber kein Event.
          await cursorRef.set({ ts: Date.now(), skipped: "empty_transcript" });
          continue;
        }

        const phone = callerPhoneOf(conv);
        const body = {
          transcript: manifest,
          channel: "bianca_call",
          direction: "in",
          sourceId: convId,
          counterparty: { kind: "patient", name: "", ref: phone },
          payloadRef: { kind: "elevenlabs_conversation", id: convId },
          extractor: "bianca@convai-poll",
          ts: startedMs || undefined,
        };
        const base = `http://127.0.0.1:${port || process.env.PORT || 4000}`;
        const resp = await fetch(`${base}/brain/ingest/transcript?clientId=${encodeURIComponent(clientId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || `ingest_http_${resp.status}`);

        await cursorRef.set({
          ts: Date.now(),
          eventId: data?.event?.id || null,
          phone: phone || null,
          startedAt: startedMs || null,
          createdAt: FieldValue.serverTimestamp(),
        });
        // Anrufer ins geteilte Adressbuch — mit dem Namen, den der Extraktor
        // aus dem Gespräch gezogen hat (falls vorhanden).
        if (phone) {
          const evName = String(data?.event?.subject?.name || data?.event?.counterparty?.name || "").trim();
          await upsertSharedContact(clientId, { name: evName, phone, source: "bianca_call", ts: startedMs || undefined });
        }
        ingested += 1;
        log.info("bianca.call.ingested", { clientId, convId, eventId: data?.event?.id || null });
      } catch (e) {
        log.warn("bianca.call.ingest_error", { clientId, convId, error: String(e?.message || e) });
      }
    }
    return { checked, ingested };
  } finally {
    ingestBusy = false;
  }
}
