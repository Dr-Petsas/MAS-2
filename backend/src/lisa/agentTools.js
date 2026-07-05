import { log } from "../log.js";

// ============================================================================
// W-OUTREACH-2 — Lisas Kalender-Werkzeuge am ElevenLabs-Agenten.
//
// Lisa ist ein ElevenLabs-ConvAI-Agent. Damit sie IM Gespräch echte Termine
// anbieten und fest buchen kann, bekommt ihr Agent zwei Webhook-Tools, die auf
// dieses Backend zeigen (src/routes/lisaTools.js):
//
//   offer_slots -> POST {PUBLIC_BASE_URL}/lisa/tools/offer-slots
//   book_slot   -> POST {PUBLIC_BASE_URL}/lisa/tools/book-slot
//
// task_id/client_id werden NICHT vom LLM erfunden: ElevenLabs setzt sie als
// Dynamic Variables (lisaStartCall übergibt sie beim Anrufstart) direkt in den
// Request-Body ein. Authentifiziert wird mit einem festen Secret-Header.
//
// Die öffentliche Backend-URL (Cloudflare-Tunnel) wechselt bei Neustarts —
// deshalb gleicht syncLisaAgentTools() bei JEDEM Backend-Boot die Tool-URLs
// mit der aktuellen PUBLIC_BASE_URL ab (idempotent: legt an, aktualisiert,
// verdrahtet am Agenten). Manuell: node scripts/setup-lisa-agent-tools.mjs
// ============================================================================

const API = "https://api.elevenlabs.io";

function env(name) {
  return (process.env[name] || "").trim();
}

/** Alles da, um Live-Buchung im Anruf anzubieten? (Instruktions-Gate) */
export function liveBookingConfigured() {
  return !!(
    env("ELEVENLABS_API_KEY") &&
    env("LISA_AGENT_ID") &&
    env("LISA_TOOL_SECRET") &&
    env("PUBLIC_BASE_URL").startsWith("https://")
  );
}

async function elApi(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "xi-api-key": env("ELEVENLABS_API_KEY") },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = data?.detail?.message || (typeof data?.detail === "string" ? data.detail : "") || `http_${r.status}`;
    throw new Error(`elevenlabs ${method} ${path}: ${detail}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Tool-Definitionen (Quelle der Wahrheit für Name/Beschreibung/Schema)
// ---------------------------------------------------------------------------

function toolDefinitions({ baseUrl, secret }) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const idProps = {
    task_id: { type: "string", dynamic_variable: "task_id" },
    client_id: { type: "string", dynamic_variable: "client_id" },
  };
  const common = {
    response_timeout_secs: 20,
    // Werkzeug läuft — Lisa überbrückt kurz, statt zu schweigen.
    disable_interruptions: false,
  };
  return [
    {
      type: "webhook",
      name: "offer_slots",
      description:
        "Freie Termine der Praxis abrufen, wenn der angebotene Termin nicht passt oder der Patient einen anderen Zeitpunkt möchte. " +
        "Gib den Wunsch des Patienten (z. B. 'Donnerstag nachmittags', 'nächste Woche vormittags', 'um 15 Uhr') im Feld wish an, wenn er einen geäußert hat. " +
        "Die Antwort enthält in spoken den Text, an dem du dich orientierst, und in slots die wählbaren Termine mit ihrem iso-Wert für book_slot.",
      ...common,
      api_schema: {
        url: `${base}/lisa/tools/offer-slots`,
        method: "POST",
        request_headers: { "X-Lisa-Tool-Secret": secret },
        request_body_schema: {
          type: "object",
          required: [],
          properties: {
            ...idProps,
            wish: {
              type: "string",
              description:
                "Terminwunsch des Patienten in eigenen Worten, z. B. 'Donnerstag nachmittags' oder 'nächste Woche vormittags'. Leer lassen, wenn kein Wunsch geäußert wurde.",
            },
          },
        },
      },
    },
    {
      type: "webhook",
      name: "book_slot",
      description:
        "Bucht einen Termin SOFORT fest im Praxiskalender. Rufe dieses Werkzeug auf, sobald der Patient einem konkreten Termin zustimmt — " +
        "entweder dem im Auftrag genannten Termin oder einem Termin aus offer_slots (übergib dessen iso-Wert als slot_iso). " +
        "Bestätige dem Patienten den Termin erst, wenn die Antwort booked=true meldet. Ist der Termin inzwischen vergeben, enthält die Antwort sofort neue Alternativen.",
      ...common,
      api_schema: {
        url: `${base}/lisa/tools/book-slot`,
        method: "POST",
        request_headers: { "X-Lisa-Tool-Secret": secret },
        request_body_schema: {
          type: "object",
          required: ["slot_iso"],
          properties: {
            ...idProps,
            slot_iso: {
              type: "string",
              description:
                "Exakter Zeitpunkt des zu buchenden Termins im ISO-Format, z. B. 2026-07-14T10:30:00+02:00. Bei Zusage zum im Auftrag genannten Termin: den dort genannten slot_iso-Wert verwenden; sonst den iso-Wert aus offer_slots.",
            },
          },
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Idempotenter Abgleich: Workspace-Tools anlegen/aktualisieren + am Agenten
// verdrahten. Wird beim Backend-Boot (server.js) und per Skript aufgerufen.
// ---------------------------------------------------------------------------

export async function syncLisaAgentTools({ baseUrl } = {}) {
  const url = String(baseUrl || env("PUBLIC_BASE_URL")).replace(/\/+$/, "");
  if (!env("ELEVENLABS_API_KEY") || !env("LISA_AGENT_ID")) {
    return { ok: false, reason: "elevenlabs_not_configured" };
  }
  if (!env("LISA_TOOL_SECRET")) {
    return { ok: false, reason: "no_tool_secret" };
  }
  if (!url.startsWith("https://")) {
    // Ohne öffentliche URL kann ElevenLabs die Webhooks nicht erreichen —
    // dann lieber gar nicht verdrahten (Instruktionen bleiben im Fallback).
    return { ok: false, reason: "no_public_https_url" };
  }

  const wanted = toolDefinitions({ baseUrl: url, secret: env("LISA_TOOL_SECRET") });

  // 1) Vorhandene Workspace-Tools nach Namen auflösen.
  const listing = await elApi("GET", "/v1/convai/tools");
  const existing = new Map(
    (Array.isArray(listing?.tools) ? listing.tools : [])
      .map((t) => [t?.tool_config?.name, t])
      .filter(([name]) => !!name)
  );

  const ids = [];
  const actions = [];
  for (const def of wanted) {
    const hit = existing.get(def.name);
    if (hit?.id) {
      await elApi("PATCH", `/v1/convai/tools/${encodeURIComponent(hit.id)}`, { tool_config: def });
      ids.push(hit.id);
      actions.push(`updated:${def.name}`);
    } else {
      const created = await elApi("POST", "/v1/convai/tools", { tool_config: def });
      const newId = created?.id || created?.tool_id || created?.tool?.id;
      if (!newId) throw new Error(`tool create returned no id for ${def.name}`);
      ids.push(newId);
      actions.push(`created:${def.name}`);
    }
  }

  // 2) Am Agenten verdrahten (bestehende fremde Tools des Agenten behalten).
  const agentId = env("LISA_AGENT_ID");
  const agent = await elApi("GET", `/v1/convai/agents/${encodeURIComponent(agentId)}`);
  const currentIds = agent?.conversation_config?.agent?.prompt?.tool_ids || [];
  const merged = [...new Set([...currentIds, ...ids])];
  const changed = merged.length !== currentIds.length;
  if (changed) {
    await elApi("PATCH", `/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      conversation_config: { agent: { prompt: { tool_ids: merged } } },
    });
  }

  log.info("lisa.agent_tools_synced", { baseUrl: url, actions, agentToolIdsAdded: changed });
  return { ok: true, baseUrl: url, actions, toolIds: ids, agentUpdated: changed };
}
