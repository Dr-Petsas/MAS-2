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
    let id = docIdFor(email, phone);

    // Zuordnen statt duplizieren: Kennt ein bestehender Eintrag (z.B. der
    // Mail-Kontakt mit Nummer aus der Signatur) diese Rufnummer bereits,
    // wird DER angereichert — kein zweiter tel_-Datensatz für dieselbe Person.
    if (!email && phone) {
      const existing = await findContactsByPhone(clientId, phone);
      if (existing[0]?.id) id = existing[0].id;
    }

    // Umgekehrt: Gab es die Person bisher nur als tel_-Eintrag (Anruferin ohne
    // bekannte Adresse) und jetzt kommt die E-Mail dazu, wandern die Daten auf
    // den E-Mail-Datensatz und der tel_-Eintrag verschwindet.
    if (email && phone) {
      const telId = docIdFor("", phone);
      const telRef = contacts(clientId).doc(telId);
      const telDoc = await telRef.get();
      if (telDoc.exists && telId !== id) {
        const t = telDoc.data() || {};
        const carry = {};
        if (t.name && !c.name) carry.name = t.name;
        if (Array.isArray(t.sources) && t.sources.length) carry.sources = FieldValue.arrayUnion(...t.sources);
        if (t.count) carry.count = FieldValue.increment(t.count);
        await contacts(clientId).doc(id).set(carry, { merge: true });
        await telRef.delete();
      }
    }

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
 * Namen der zuletzt gesehenen Kontakte (fuer Claras STT-Bias, Chef 25.07.2026).
 * Beschraenkt (neueste zuerst, gedeckelt); der Backfill-Marker traegt kein
 * lastSeenAt und faellt aus der Sortierung. Best-effort, wirft nie.
 *
 * @param {string} clientId
 * @param {{limit?:number}} [opts]
 * @returns {Promise<string[]>}
 */
export async function listRecentContactNames(clientId, { limit = 600 } = {}) {
  try {
    const snap = await contacts(clientId)
      .orderBy("lastSeenAt", "desc")
      .limit(Math.max(1, Math.min(2000, limit)))
      .get();
    const names = [];
    for (const d of snap.docs) {
      if (d.id === BACKFILL_MARKER) continue;
      const n = String(d.data()?.name || "").trim();
      if (n) names.push(n);
    }
    return names;
  } catch (e) {
    log.warn("addressbook.list_recent_failed", { clientId, error: String(e?.message || e) });
    return [];
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
// Dubletten-Analyse + Bereinigung (Cockpit, Nacht 12.06.2026).
//
// Die Sorge des Chefs: "Gehirn zu groß und voll, Agenten suchen ewig". Neben
// dem Retention-Regler gehört dazu, dass dieselbe Person nicht mehrfach im
// Buch steht. Trotz Upsert-Logik entstehen Kandidaten: ein tel_-Eintrag von
// einem Anruf + ein Mail-Kontakt derselben Firma, oder zwei Schreibweisen
// desselben Namens. Die Analyse findet Gruppen (gleiche Nummer ODER gleicher
// Namens-Schlüssel), der Merge vereinigt sie auf EINEN Datensatz.
// ----------------------------------------------------------------------------

function nameKeyForDupes(name) {
  const folded = String(name || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  const toks = folded
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !["herr", "frau", "dr", "prof", "med", "dent", "gmbh", "kg", "ag"].includes(t));
  return [...new Set(toks)].sort().join(" ");
}

function publicContact(d) {
  const x = d.data();
  return {
    id: d.id,
    name: x.name || "",
    address: x.address || "",
    phones: Array.isArray(x.phones) ? x.phones : [],
    sources: Array.isArray(x.sources) ? x.sources : [],
    count: x.count || 0,
    lastSeenAt: x.lastSeenAt || 0,
    category: x.category || "",
  };
}

/**
 * Findet Dubletten-GRUPPEN im Adressbuch: gleiche Telefonnummer in mehreren
 * Datensätzen oder gleicher Namens-Schlüssel. Reine Analyse, ändert nichts.
 */
export async function analyzeContactDupes(clientId) {
  const snap = await contacts(clientId).limit(2000).get();
  const all = snap.docs.filter((d) => d.id !== BACKFILL_MARKER).map(publicContact);

  const groups = [];
  const grouped = new Set();

  const addGroup = (reason, key, members) => {
    const fresh = members.filter((m) => !grouped.has(m.id));
    if (fresh.length < 2) return;
    fresh.forEach((m) => grouped.add(m.id));
    // Vorschlag: der E-Mail-Datensatz überlebt (stabile Id = sha1(Adresse)),
    // sonst der mit den meisten Kontakten.
    const withMail = fresh.filter((m) => m.address);
    const keep = (withMail.length === 1 ? withMail[0] : null)
      || [...fresh].sort((a, b) => (b.count - a.count) || (b.lastSeenAt - a.lastSeenAt))[0];
    groups.push({
      reason,
      key,
      mergeable: withMail.length <= 1, // 2 verschiedene Mail-Adressen: nur manuell
      suggestedKeepId: keep.id,
      contacts: fresh,
    });
  };

  // 1) Gleiche Rufnummer in mehreren Datensätzen.
  const byPhone = new Map();
  for (const c of all) {
    for (const p of c.phones) {
      if (!byPhone.has(p)) byPhone.set(p, []);
      byPhone.get(p).push(c);
    }
  }
  for (const [phone, members] of byPhone) {
    if (members.length > 1) addGroup("phone", phone, members);
  }

  // 2) Gleicher Namens-Schlüssel ("Müller Peter" == "Peter Mueller").
  const byName = new Map();
  for (const c of all) {
    const key = nameKeyForDupes(c.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(c);
  }
  for (const [key, members] of byName) {
    if (members.length > 1) addGroup("name", key, members);
  }

  return { total: all.length, groups, duplicates: groups.reduce((n, g) => n + g.contacts.length - 1, 0) };
}

/**
 * Vereinigt eine Dubletten-Gruppe auf EINEN Datensatz: Nummern/Quellen werden
 * vereinigt, Zähler addiert, die übrigen Dokumente gelöscht. Hat genau ein
 * Mitglied eine E-Mail-Adresse, MUSS dieses überleben (die Doc-Id ist der
 * Hash der Adresse — künftige Mail-Upserts landen sonst wieder im Gelöschten).
 */
export async function mergeContacts(clientId, keepId, mergeIds = []) {
  const ids = [...new Set(mergeIds.filter((x) => x && x !== keepId))];
  if (!keepId || !ids.length) return { ok: false, reason: "nichts_zu_mergen" };

  const keepRef = contacts(clientId).doc(keepId);
  const keepDoc = await keepRef.get();
  if (!keepDoc.exists) return { ok: false, reason: "keep_nicht_gefunden" };
  const keep = keepDoc.data();

  const patch = { relevant: true };
  let addCount = 0;
  const addPhones = [];
  const addSources = [];
  for (const id of ids) {
    const ref = contacts(clientId).doc(id);
    const doc = await ref.get();
    if (!doc.exists) continue;
    const m = doc.data();
    if (m.address && keep.address && m.address !== keep.address) {
      return { ok: false, reason: "zwei_mail_adressen", detail: `${keep.address} vs. ${m.address}` };
    }
    if (m.address && !keep.address) {
      return { ok: false, reason: "keep_muss_mail_kontakt_sein", detail: m.address };
    }
    if (m.name && !keep.name && !looksLikePhoneName(m.name)) patch.name = m.name;
    if (m.category && !keep.category) patch.category = m.category;
    if (m.lastSubject && !keep.lastSubject) patch.lastSubject = m.lastSubject;
    if ((m.lastSeenAt || 0) > (keep.lastSeenAt || 0)) patch.lastSeenAt = m.lastSeenAt;
    addCount += m.count || 0;
    addPhones.push(...(Array.isArray(m.phones) ? m.phones : []));
    addSources.push(...(Array.isArray(m.sources) ? m.sources : []));
    await ref.delete();
  }

  if (addPhones.length) patch.phones = FieldValue.arrayUnion(...addPhones);
  if (addSources.length) patch.sources = FieldValue.arrayUnion(...addSources);
  if (addCount) patch.count = FieldValue.increment(addCount);
  await keepRef.set(patch, { merge: true });

  log.info("addressbook.merged", { clientId, keepId, merged: ids.length });
  return { ok: true, keepId, merged: ids.length };
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
