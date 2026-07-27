// Bruecke zum Clara-Testlabor (Python-Dienst auf DIESER Maschine).
//
// W-LABOR (27.07.2026). Der Labor-Dienst (F:\Clara-Voice\testsuite\lab_server.py)
// haelt Modell, Profil und Tools dauerhaft im Speicher und beantwortet
// Einzelfragen in 1-3 s. Dieses Modul ist nur der Postbote: es reicht Anfragen
// durch und streamt Antworten weiter. Fachlogik gehoert in den Labor-Dienst,
// Speicherung pro Mandant in store.js.
//
// Der Dienst laeuft NUR lokal (127.0.0.1) und wird nie von aussen erreichbar
// gemacht - die MAS-Routen davor sind superuser-pflichtig.

const LAB_URL = (process.env.CLARA_LAB_URL || "http://127.0.0.1:8160").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.CLARA_LAB_TIMEOUT_MS || 300000);

export function labUrl() {
  return LAB_URL;
}

/** JSON-Aufruf an den Labor-Dienst. Wirft mit sprechender Meldung. */
export async function labFetch(path, { method = "GET", body = null, timeoutMs = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(`${LAB_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e?.name === "AbortError") throw new Error(`Testlabor antwortet nicht (${timeoutMs} ms).`);
    throw new Error(
      `Testlabor nicht erreichbar (${LAB_URL}). Laeuft es? ` +
      `Start: python testsuite/lab_server.py in F:\\Clara-Voice`);
  }
  clearTimeout(timer);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) {
    throw new Error(String(data?.error || `Testlabor HTTP ${resp.status}`));
  }
  return data;
}

/**
 * Lauf starten und Zeile fuer Zeile an den Browser weiterreichen.
 * Der Labor-Dienst liefert NDJSON; wir geben es unveraendert weiter, damit die
 * Seite jedes Ergebnis in dem Moment zeigt, in dem es fertig ist.
 */
export async function labStream(body, res) {
  const ctrl = new AbortController();
  res.on("close", () => ctrl.abort());   // Browser weg -> Lauf abbrechen lassen

  let upstream;
  try {
    upstream = await fetch(`${LAB_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    res.status(502).json({ ok: false, error: `Testlabor nicht erreichbar (${LAB_URL}).` });
    return;
  }
  if (!upstream.ok) {
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json({ ok: false, error: String(data?.error || `HTTP ${upstream.status}`) });
    return;
  }

  res.status(200);
  res.set("Content-Type", "application/x-ndjson; charset=utf-8");
  res.set("Cache-Control", "no-store");
  res.set("X-Accel-Buffering", "no");   // kein Puffern im Reverse-Proxy
  res.flushHeaders?.();

  try {
    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
  } catch {
    /* Verbindung weg - der Labor-Dienst raeumt selbst auf */
  }
  res.end();
}
