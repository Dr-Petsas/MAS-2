import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { log } from "../log.js";

// ============================================================================
// Das GETEILTE Adressbuch der Praxis (mas_contacts) — eine Kontaktbasis für
// ALLE Agenten, nicht nur für Nadine.
//
// Bisher entstand das Adressbuch ausschließlich aus eingehenden E-Mails
// (Absender, ohne Telefonnummer). Jeder Kanal kannte nur seine eigenen
// Kontakte: Lisa wusste, wen sie angerufen hat, Bianca, wer angerufen hat,
// Nadine, wer geschrieben hat — aber niemand kannte die Kontakte der anderen.
//
// Dieses Modul ist der EINE Schreib-/Lesepfad:
//   - upsertSharedContact: jeder Kanal (Mail-Sync, Mail-Ausgang, Lisa-SMS/
//     -Anruf, Bianca-Ingest, find_contact-Lernen) legt seinen Kontakt hier ab.
//     Gleiche E-Mail-Adresse => gleicher Datensatz (kompatibel mit den
//     bestehenden Mail-Kontakten); nur Telefonnummer => eigener tel_-Datensatz.
//   - findContactsByPhone: "Wer ruft da an?" — fürs Klingeln (Bianca),
//     lookup_caller und find_contact.
//   - backfillAddressBook: holt Bestandsdaten nach (Brain-Events + Posteingang
//     mit Nummern aus Signaturen). Idempotent, einmalig beim Start.
//
// Patienten bleiben bewusst draußen: für sie ist die Patientendatenbank die
// Quelle der Wahrheit (search_patient/contact_card) — das Adressbuch ist für
// alle ANDEREN (Labor, Handwerker, Lieferanten, Anrufer).
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const CONTACT_COL = "mas_contacts";

function contacts(clientId) {
  return masCollection(clientId, CONTACT_COL);
}

// Kanonische Form fürs Buch: E.164 ("+49177...") — gleiche Nummer, ein Eintrag,
// egal ob sie als "0177...", "+49 177..." oder "0049..." hereinkam.
export function normalizeBookPhone(raw) {
  let v = String(raw || "").replace(/[^\d+]/g, "");
  if (!v) return "";
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  else if (v.startsWith("0")) v = `+49${v.slice(1)}`;
  else if (!v.startsWith("+")) v = `+${v}`;
  v = `+${v.slice(1).replace(/\+/g, "")}`;
  const digits = v.slice(1);
  if (digits.length < 8 || digits.length > 15) return "";
  return v;
}

// Erste deutsche Telefonnummer aus Fließtext (E-Mail-Signaturen): "Tel: 0521 / 12 34 56".
// Zwei Stufen: (1) beschriftete Nummern ("Tel.: ...") sind vertrauenswürdig,
// (2) unbeschriftete nur, wenn sie nicht wie ein Datum aussehen ("06.01.2025"
// hat genau 8 Ziffern und würde sonst als "+496012025" im Buch landen).
const LABELED_PHONE_RE = /(?:tel|telefon|fon|mobil|handy|phone|durchwahl)[.:\s]{0,4}((?:\+49|0049|0)[\d\s\/\-().]{6,18}\d)/gi;
const PHONE_IN_TEXT_RE = /(?:\+49|0049|0)[\d\s\/\-().]{7,18}\d/g;
const DATE_LIKE_RE = /\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*(?:19|20)?\d{2}/;

// Plausible deutsche Nummer: +49, dann KEINE 0 (gibt es nach Landesvorwahl
// nicht — filtert Steuer-/Referenznummern wie "+49020261275"), 9-13 Ziffern.
const PLAUSIBLE_DE_RE = /^\+49[1-9]\d{8,12}$/;

export function extractPhoneFromText(text) {
  const t = String(text || "");
  for (const m of t.matchAll(LABELED_PHONE_RE)) {
    const norm = normalizeBookPhone(m[1]);
    if (norm && PLAUSIBLE_DE_RE.test(norm)) return norm;
  }
  for (const m of t.match(PHONE_IN_TEXT_RE) || []) {
    if (DATE_LIKE_RE.test(m)) continue;
    if (m.replace(/\D/g, "").length < 9) continue; // Daten/Kundennummern raus
    const norm = normalizeBookPhone(m);
    if (norm && PLAUSIBLE_DE_RE.test(norm)) return norm;
  }
  return "";
}

function docIdFor(email, phone) {
  // E-Mail-Kontakte behalten ihre bisherigen Ids (sha1(address), 24 hex) —
  // der Bestand wird angereichert statt dupliziert.
  if (email) return createHash("sha1").update(email).digest("hex").slice(0, 24);
  return `tel_${createHash("sha1").update(phone).digest("hex").slice(0, 20)}`;
}

function looksLikePhoneName(name) {
  return /^[+\d][\d\s\/\-().]*$/.test(String(name || "").trim());
}

/**
 * Der eine Schreibpfad ins geteilte Adressbuch. Best-effort: wirft nie,
 * ein Buch-Eintrag darf niemals eine SMS/Mail/Anruf-Aktion scheitern lassen.
 *
 * @param {string} clientId
 * @param {{name?:string, email?:string, phone?:string, source:string, category?:string, subject?:string, ts?:number}} c
 * @returns {Promise<string|null>} doc id oder null
 */
export async function upsertSharedContact(clientId, c = {}) {
  try {
    const email = String(c.email || "").toLowerCase().trim();
    const phone = normalizeBookPhone(c.phone);
    if (!email && !phone) return null;
    const id = docIdFor(email, phone);

    const patch = {
      lastSeenAt: c.ts || Date.now(),
      count: FieldValue.increment(1),
      relevant: true,
      sources: FieldValue.arrayUnion(String(c.source || "unbekannt")),
    };
    if (email) patch.address = email;
    if (phone) patch.phones = FieldValue.arrayUnion(phone);
    // Eine echte Namensangabe nie durch eine als Name durchgereichte Nummer
    // ersetzen ("01776004600" ist kein Name).
    const name = String(c.name || "").trim();
    if (name && !looksLikePhoneName(name)) patch.name = name;
    if (c.category) patch.category = c.category;
    if (c.subject) patch.lastSubject = c.subject;

    await contacts(clientId).doc(id).set(patch, { merge: true });
    return id;
  } catch (e) {
    log.warn("addressbook.upsert_failed", { clientId, error: String(e?.message || e) });
    return null;
  }
}

/**
 * "Wer ist das?" — Kontakte zur Rufnummer, fürs Klingeln und für lookup_caller.
 */
export async function findContactsByPhone(clientId, phone) {
  const tel = normalizeBookPhone(phone);
  if (!tel) return [];
  try {
    const snap = await contacts(clientId).where("phones", "array-contains", tel).limit(5).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    log.warn("addressbook.phone_lookup_failed", { clientId, error: String(e?.message || e) });
    return [];
  }
}

// ----------------------------------------------------------------------------
// Backfill: Bestandsdaten ins Buch holen. Zwei Quellen:
//   1. Brain-Events (60 Tage): Lisa-/Bianca-/Clara-Telefonate mit Rufnummer.
//   2. Posteingang: praxisrelevante Absender um die Nummer aus der Signatur
//      anreichern (die Adresse selbst steht schon im Buch).
// Idempotent — Upserts auf stabile Ids. Läuft einmal pro Serverstart.
// ----------------------------------------------------------------------------

const BACKFILL_MARKER = "_meta_backfill"; // ohne lastSeenAt -> unsichtbar für listContacts

export async function backfillAddressBook(clientId, { days = 60, mailScan = 60, force = false } = {}) {
  const out = { events: 0, mails: 0, skipped: false };

  const marker = contacts(clientId).doc(BACKFILL_MARKER);
  if (!force) {
    const seen = await marker.get().catch(() => null);
    if (seen?.exists && (seen.data()?.version || 0) >= 1) {
      out.skipped = true;
      return out;
    }
  }

  // Aufräumen: bereits gespeicherte Pseudo-Nummern entfernen (als Telefon-
  // nummer fehlgedeutete Daten/Referenznummern aus Mail-Texten). Kontakte mit
  // Anruf-Quelle dürfen auch ausländische Nummern tragen (echte Anrufer-Ids);
  // bei reinen Mail-Kontakten muss die Nummer plausibel deutsch sein.
  try {
    const snap = await contacts(clientId).where("phones", "!=", null).limit(500).get();
    for (const d of snap.docs) {
      const data = d.data();
      const phones = Array.isArray(data.phones) ? data.phones : [];
      const fromCalls = (Array.isArray(data.sources) ? data.sources : []).some((s) => /call|sms/.test(String(s)));
      const clean = phones.filter((p) => (fromCalls
        ? String(p).replace(/\D/g, "").length >= 10
        : PLAUSIBLE_DE_RE.test(String(p))));
      if (clean.length !== phones.length) {
        await d.ref.set({ phones: clean }, { merge: true });
        out.cleaned = (out.cleaned || 0) + 1;
      }
    }
  } catch (e) {
    log.warn("addressbook.cleanup_failed", { clientId, error: String(e?.message || e) });
  }

  // 1) Telefon-Events aus dem Brain
  try {
    const { queryRecent } = await import("./eventStore.js");
    const events = await queryRecent(clientId, Date.now() - days * 86400000, 1500);
    for (const e of events) {
      const channel = String(e?.channel || "");
      if (!/^(lisa_call|lisa_sms|bianca_call)$/.test(channel)) continue;
      const phone = normalizeBookPhone(e?.counterparty?.ref || "");
      if (!phone) continue;
      const name = String(e?.counterparty?.name || e?.subject?.name || "").trim();
      const id = await upsertSharedContact(clientId, {
        name, phone, source: channel, ts: e.ts || Date.now(),
      });
      if (id) out.events += 1;
    }
  } catch (e) {
    log.warn("addressbook.backfill_events_failed", { clientId, error: String(e?.message || e) });
  }

  // 2) Nummern aus Mail-Signaturen (nur relevante, neueste zuerst)
  try {
    const { listMessages, getMessage } = await import("../mail/store.js");
    const rows = await listMessages(clientId, { folder: "INBOX", limit: 200 });
    let fetched = 0;
    for (const r of rows) {
      if (fetched >= mailScan) break;
      if (r.relevant === false) continue;
      const fromAddr = String(r.from?.address || "").toLowerCase();
      if (!fromAddr) continue;
      fetched += 1;
      const full = await getMessage(clientId, r.id).catch(() => null);
      if (!full) continue;
      const bodyText = `${String(full.textBody || "")} ${String(full.htmlBody || "").replace(/<[^>]+>/g, " ")}`;
      const phone = extractPhoneFromText(bodyText);
      if (!phone) continue;
      const id = await upsertSharedContact(clientId, {
        name: full.from?.name || "", email: fromAddr, phone,
        source: "nadine_mail_signatur", subject: full.subject || "",
        ts: full.date || Date.now(),
      });
      if (id) out.mails += 1;
    }
  } catch (e) {
    log.warn("addressbook.backfill_mail_failed", { clientId, error: String(e?.message || e) });
  }

  await marker.set({ version: 1, ranAt: Date.now(), ...out }, { merge: true }).catch(() => {});
  log.info("addressbook.backfill_done", { clientId, ...out });
  return out;
}
