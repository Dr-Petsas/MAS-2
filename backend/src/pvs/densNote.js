// DENS-Karteinotiz aus Lena-Doku.
// Nutzt die Feldnamen, die DENSappConnect / WriteNotizPatient kennt
// (PatientNummer, KurzBezeichnung max. 39). Kein 01-Schema, kein Bank-Zugriff.

export const KURZ_MAX = 39;
export const KURZ_DEFAULT = "Pickadoc Doku";

function s(v) {
  return String(v == null ? "" : v).trim();
}

export function sanitizePatNr(v) {
  return s(v).replace(/[^\w.\-]/g, "").replace(/^\.+/, "").slice(0, 32);
}

export function kurzBezeichnung({ lastName = "", firstName = "" } = {}) {
  const name = [s(lastName), s(firstName)].filter(Boolean).join(" ");
  const raw = name ? `${KURZ_DEFAULT} ${name}` : KURZ_DEFAULT;
  if (raw.length <= KURZ_MAX) return raw;
  return raw.slice(0, KURZ_MAX).trim();
}

function stamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return stamp();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function xmlAttr(v) {
  return s(v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function safeFilePart(name, max = 80) {
  return s(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || "Dokument";
}

export function toExtDokXml({
  patNr = "",
  kurz = "Pickadoc",
  dateiname = "",
  anmerkung = "Pickadoc",
} = {}) {
  const k = s(kurz).slice(0, KURZ_MAX) || KURZ_DEFAULT;
  return [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    `<PatientExtDok PatientNummer="${xmlAttr(patNr)}" Dateiname="${xmlAttr(dateiname)}" Anmerkung="${xmlAttr(anmerkung)}" KurzBezeichnung="${xmlAttr(k)}"/>`,
    "",
  ].join("\n");
}

export function toNotizXml({ patNr, kurz, text } = {}) {
  const body = String(text == null ? "" : text).replace(/]]>/g, "]]]]><![CDATA[>");
  return [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    `<PatientNotiz PatientNummer="${xmlAttr(patNr)}" KurzBezeichnung="${xmlAttr(kurz)}">`,
    `<Text><![CDATA[${body}]]></Text>`,
    "</PatientNotiz>",
    "",
  ].join("\n");
}

export function buildNote(input = {}) {
  const text = s(input.text);
  if (!text) {
    const err = new Error("text_required");
    err.code = "text_required";
    throw err;
  }
  const patNr = sanitizePatNr(input.patNr || input.densPatNr || input.dampsoftPatNr || input.externalId);
  const lastName = s(input.lastName);
  const firstName = s(input.firstName);
  if (!patNr && !lastName && !firstName) {
    const err = new Error("identity_required");
    err.code = "identity_required";
    throw err;
  }
  const kurz = kurzBezeichnung({ lastName, firstName });
  const createdAt = s(input.createdAt) || new Date().toISOString();
  const who = patNr || [lastName, firstName].filter(Boolean).join("-").replace(/[^\w.\-]+/g, "_").slice(0, 40) || "ohne-id";
  const stem = `${who}-pickadoc-doku-${stamp(createdAt)}`;
  return {
    patNr,
    lastName,
    firstName,
    kurz,
    text,
    createdAt,
    stem,
    xml: toNotizXml({ patNr, kurz, text }),
  };
}
