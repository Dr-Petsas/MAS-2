// Thin client for the local LLM (Qwen via Ollama, OpenAI-compatible API). Reuses
// the same engine the voice pipeline uses — NO OpenAI/cloud. Robust by design:
// short timeout, never throws to the caller; returns { ok, text } so callers can
// fall back to a deterministic template when the model is offline.

// Read config per-call so env changes (and tests) take effect without re-import.
function cfg() {
  return {
    base: (process.env.MAS_LLM_BASE_URL || "http://127.0.0.1:11434/v1").replace(/\/+$/, ""),
    model: process.env.MAS_LLM_MODEL || "qwen3:4b-instruct",
    apiKey: process.env.MAS_LLM_API_KEY || "ollama",
  };
}

/**
 * Chat completion against the local model.
 * @param {{role:string, content:string}[]} messages
 * @param {{ temperature?: number, maxTokens?: number, timeoutMs?: number }} opts
 * @returns {Promise<{ok:boolean, text:string, reason?:string, model:string}>}
 */
export async function chat(messages, { temperature = 0.4, maxTokens = 900, timeoutMs = 45000, model: modelOverride } = {}) {
  const c = cfg();
  const base = c.base;
  const apiKey = c.apiKey;
  const model = modelOverride || c.model;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return { ok: false, text: "", reason: `llm_http_${resp.status}`, model, detail: detail.slice(0, 200) };
    }
    const data = await resp.json();
    let text = data?.choices?.[0]?.message?.content || "";
    // qwen3 may emit <think>…</think> reasoning — strip it for clean output.
    text = String(text).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    return { ok: true, text, model };
  } catch (e) {
    const reason = e?.name === "AbortError" ? "llm_timeout" : "llm_unreachable";
    return { ok: false, text: "", reason, model };
  } finally {
    clearTimeout(t);
  }
}

export function llmInfo() {
  const { base, model } = cfg();
  return { base, model };
}

// DSGVO guard: is the configured LLM endpoint on-premise (localhost / private
// LAN)? Patient content must never leave the practice network, so we can verify
// — and optionally enforce — that the model runs locally rather than in a cloud.
export function isLocalLlm(base = cfg().base) {
  let host = "";
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
  // RFC 1918 private ranges (on-prem GPU box on the practice LAN).
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".internal")) return true;
  return false;
}

/**
 * Liveness probe for the local model: lists models on the OpenAI-compatible
 * endpoint (Ollama supports GET /models). Cheap, short timeout. Used by
 * /health/ready so an operator sees whether Nadine's local brain is actually up
 * (otherwise she silently degrades to deterministic templates).
 *
 * @returns {Promise<{reachable:boolean, base:string, model:string, local:boolean, models?:string[], reason?:string}>}
 */
export async function llmHealth(timeoutMs = 2500) {
  const { base, model } = cfg();
  const local = isLocalLlm(base);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${cfg().apiKey}` },
      signal: ctrl.signal,
    });
    if (!resp.ok) return { reachable: false, base, model, local, reason: `http_${resp.status}` };
    const data = await resp.json().catch(() => ({}));
    const models = Array.isArray(data?.data) ? data.data.map((m) => m?.id).filter(Boolean) : undefined;
    return { reachable: true, base, model, local, models };
  } catch (e) {
    return { reachable: false, base, model, local, reason: e?.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(t);
  }
}
