// Kostenvoranschlag aus PlanR als Entwurf für Nadines Mailfenster: PlanR legt Empfänger, Betreff, Text und
// PDF ab, Nadine öffnet ihn als neue Mail (/clara?ki=nadine&entwurf=<id>). Nur im Speicher, 2 h gültig, je Praxis.
import crypto from "node:crypto";

const GUELTIG_MS = 2 * 60 * 60 * 1000;
const HOECHSTENS = 200;
const entwuerfe = new Map();

function aufraeumen() {
  const jetzt = Date.now();
  for (const [id, e] of entwuerfe) if (e.bis < jetzt) entwuerfe.delete(id);
  while (entwuerfe.size > HOECHSTENS) entwuerfe.delete(entwuerfe.keys().next().value);
}

export function kvaEntwurfAblegen(clientId, { to, subject, text, attachment }) {
  aufraeumen();
  const id = crypto.randomBytes(16).toString("base64url");
  entwuerfe.set(id, { clientId, to, subject, text, attachment, bis: Date.now() + GUELTIG_MS });
  return id;
}

export function kvaEntwurfHolen(clientId, id) {
  aufraeumen();
  const e = entwuerfe.get(String(id || ""));
  if (!e || e.clientId !== clientId) return null;
  const { to, subject, text, attachment } = e;
  return { to, subject, text, attachments: attachment ? [attachment] : [] };
}
