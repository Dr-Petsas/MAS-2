// Schreibweg in die Praxissoftware — mandantenfaehig.
// clients/{clientId}/mas_config/pvsWrite  +  clients/{clientId}/mas_pvs_outbox/*
// Dampsoft = Holen in die offene Kartei. DENS = Karteitext in den Übergabeordner.
// CGM folgt, ohne die Outbox-Schnittstelle zu aendern.

import { masCollection } from "../tenant.js";
import admin, { db } from "../firebase.js";
import { upsertPending } from "./pendingChart.js";
import { writeNoteDrop, writePdfDrop } from "./densDrop.js";
import { writeNoteViaUi } from "./densUiWrite.js";

export const PATHS = [
  {
    id: "none",
    label: "Keine Übertragung",
    software: "",
    ready: true,
    hint: "Lena speichert die Dokumentation nur in Pickadoc.",
  },
  {
    id: "dampsoft_holen",
    label: "Dampsoft DS-WIN — Holen",
    software: "dampsoft",
    ready: true,
    hint: "Beim Speichern erscheint die Dokumentation in der Übertragungsliste. In DS-WIN holst du sie mit Holen in die offene Kartei.",
  },
  {
    id: "dens",
    label: "DENS — Karteikarte",
    software: "dens",
    ready: true,
    hint: "Beim Speichern legt Lena die Doku plus unterschriebene PDFs in den DENS-Übergabeordner. DENSappConnect muss laufen. Die Bank bleibt unberührt.",
  },
  {
    id: "cgm_albis",
    label: "CGM Albis",
    software: "cgm_albis",
    ready: false,
    hint: "In Vorbereitung.",
  },
  {
    id: "cgm_z1",
    label: "CGM Z1",
    software: "cgm_z1",
    ready: false,
    hint: "In Vorbereitung.",
  },
];

const CONFIG_DOC = "pvsWrite";

export function emptySettings() {
  return {
    path: "none",
    enqueueOnFinalize: true,
    densDropDir: "",
    updatedAt: "",
    updatedBy: "",
  };
}

function configRef(clientId) {
  return masCollection(clientId, "mas_config").doc(CONFIG_DOC);
}

function outboxCol(clientId) {
  return masCollection(clientId, "mas_pvs_outbox");
}

export function pathById(id) {
  return PATHS.find((p) => p.id === id) || PATHS[0];
}

export async function getWritePath(clientId) {
  const snap = await configRef(clientId).get();
  const raw = snap.exists ? snap.data() : {};
  const path = PATHS.some((p) => p.id === raw.path) ? raw.path : "none";
  return {
    ...emptySettings(),
    ...raw,
    path,
    enqueueOnFinalize: path !== "none",
    catalog: PATHS,
    active: pathById(path),
  };
}

export async function setWritePath(clientId, input = {}, updatedBy = "") {
  const cur = await getWritePath(clientId);
  const nextPath = PATHS.some((p) => p.id === input.path) ? input.path : cur.path;
  const next = {
    path: nextPath,
    enqueueOnFinalize: nextPath !== "none",
    densDropDir: input.densDropDir != null ? s(input.densDropDir) : (cur.densDropDir || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: String(updatedBy || cur.updatedBy || "").slice(0, 80),
  };
  await configRef(clientId).set(next, { merge: true });
  return getWritePath(clientId);
}

function s(v) {
  return String(v == null ? "" : v).trim();
}

/** Dampsoft-Kartei: nur Klartext. PDF-Links (Firebase-URLs mit &/?/Token)
 *  brechen die AT-Zeile — Namen bleiben, Adressen fliegen raus. */
export function stripLinksForPvs(text) {
  let t = String(text == null ? "" : text);
  t = t.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/\[([^\]]+)\]\(\s*https?:\/\/[^)]+\)/gi, "$1");
  t = t.replace(/\[([^\]]+)\]\(\s*www\.[^)]+\)/gi, "$1");
  t = t.replace(/https?:\/\/\S+/gi, "");
  t = t.replace(/\bwww\.\S+/gi, "");
  t = t.replace(/\b(?:firebasestorage|storage\.googleapis)\.[\w./%?&=#+\-]+/gi, "");
  t = t.replace(/[?&](?:alt|token|Expires|GoogleAccessId|Signature)=[^\s]*/gi, "");
  t = t.replace(/\u{1F4C4}/gu, "");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

export async function listSignedDocs(clientId, locationId, patientId) {
  const cid = s(clientId);
  const lid = s(locationId);
  const pid = s(patientId);
  if (!cid || !lid || !pid) return [];
  try {
    const snap = await db
      .collection("clients").doc(cid)
      .collection("locations").doc(lid)
      .collection("patients").doc(pid)
      .collection("pdocuments").get();
    const rows = [];
    const seen = new Set();
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (!(d.status === "signed" || d.pdfCreatedAt)) return;
      const name = String(d.name || "Dokument").trim().slice(0, 120);
      if (!name || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      rows.push({
        id: doc.id,
        name,
        storagePath: `clients/${cid}/locations/${lid}/patients/${pid}/documents/${doc.id}.pdf`,
      });
    });
    rows.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return rows;
  } catch {
    return [];
  }
}

export async function listSignedDocNames(clientId, locationId, patientId) {
  return (await listSignedDocs(clientId, locationId, patientId)).map((d) => d.name);
}

async function downloadSignedPdfs(docs) {
  if (!docs.length) return [];
  const bucket = admin.storage().bucket();
  const out = [];
  for (const d of docs) {
    try {
      const [buffer] = await bucket.file(d.storagePath).download();
      if (buffer && buffer.length) out.push({ name: d.name, buffer });
    } catch (err) {
      console.warn(`[pvs/dens] PDF fehlt (${d.name}): ${err?.message || err}`);
    }
  }
  return out;
}

export function enrichPvsText(text, docNames) {
  let t = stripLinksForPvs(text);
  t = t.replace(/DOKU-TEMPLATE ZAHNMEDIZIN/gi, "KI-DOKUMENTATION PICKADOC");
  t = t.replace(/\nLOKALAN[ÄA]STHESIE\s*$/i, "").trim();
  const names = (docNames || []).map((n) => s(n)).filter(Boolean);
  if (names.length && !/^Dokumente:/m.test(t)) {
    t = [t, "", "Dokumente:", ...names.map((n) => "- " + n)].filter(Boolean).join("\n");
  }
  return stripLinksForPvs(t);
}

export async function enqueueOutbox(clientId, input = {}) {
  const settings = await getWritePath(clientId);
  const path = settings.path;
  if (path === "none") {
    const err = new Error("no_write_path");
    err.code = "no_write_path";
    throw err;
  }
  if (!pathById(path).ready) {
    const err = new Error("path_not_ready");
    err.code = "path_not_ready";
    throw err;
  }
  const pickadocId = s(input.pickadocId);
  const locationId = s(input.locationId);
  let signedDocs = [];
  if (pickadocId && locationId) {
    signedDocs = await listSignedDocs(clientId, locationId, pickadocId);
  }
  const text = enrichPvsText(input.text, signedDocs.map((d) => d.name));
  if (!text) {
    const err = new Error("text_required");
    err.code = "text_required";
    throw err;
  }
  const lastName = s(input.lastName);
  const firstName = s(input.firstName);
  if (!lastName && !firstName && !s(input.pickadocId)) {
    const err = new Error("identity_required");
    err.code = "identity_required";
    throw err;
  }
  const now = new Date().toISOString();
  const appointmentId = s(input.appointmentId);
  const fields = {
    path,
    status: "pending",
    pickadocId: s(input.pickadocId),
    lastName,
    firstName,
    dampsoftPatNr: s(input.dampsoftPatNr || input.densPatNr || input.externalId),
    text: text.slice(0, 40000),
    appointmentId,
    locationId,
    updatedAt: now,
  };
  if (appointmentId) {
    const existing = await outboxCol(clientId).where("appointmentId", "==", appointmentId).get();
    const pending = existing.docs.find((d) => String((d.data() || {}).status || "") === "pending");
    if (pending) {
      const next = { ...pending.data(), ...fields, id: pending.id };
      await deliverVendor(next, input, settings, signedDocs);
      await pending.ref.set(next, { merge: true });
      return next;
    }
  }
  const ref = outboxCol(clientId).doc();
  const doc = { id: ref.id, ...fields, createdAt: now };
  await deliverVendor(doc, input, settings, signedDocs);
  await ref.set(doc);
  return doc;
}

async function deliverVendor(doc, input = {}, settings = {}, signedDocs = []) {
  if (doc.path === "dens") {
    try {
      const drop = writeNoteDrop({
        text: doc.text,
        patNr: doc.dampsoftPatNr,
        lastName: doc.lastName,
        firstName: doc.firstName,
        createdAt: doc.createdAt || doc.updatedAt,
      }, settings.densDropDir);
      doc.densDrop = {
        dir: drop.dir,
        txt: drop.txt,
        xml: drop.xml,
        kurz: drop.kurz,
        patNr: drop.patNr,
        pdfs: [],
      };
      const files = await downloadSignedPdfs(signedDocs);
      if (files.length) {
        const pdfs = writePdfDrop({
          patNr: doc.dampsoftPatNr,
          lastName: doc.lastName,
          firstName: doc.firstName,
          files,
        }, settings.densDropDir);
        doc.densDrop.pdfs = pdfs.files.map((f) => ({ name: f.name, pdf: f.pdf, bytes: f.bytes }));
      }
    } catch (err) {
      console.warn(`[pvs/dens] drop fehlgeschlagen: ${err?.message || err}`);
    }
    try {
      const ui = writeNoteViaUi({
        kurz: (doc.densDrop && doc.densDrop.kurz) || "PICKADOC DOKU",
        text: doc.text,
        patNr: doc.dampsoftPatNr,
        lastName: doc.lastName,
      });
      doc.densUi = { ok: true, log: ui.log };
    } catch (err) {
      console.warn(`[pvs/dens] kartei-ui fehlgeschlagen: ${err?.message || err}`);
      doc.densUi = { ok: false, error: String(err?.message || err) };
    }
    return;
  }
  if (doc.path !== "dampsoft_holen") return;
  try {
    upsertPending({
      patId: doc.dampsoftPatNr || "",
      lastName: doc.lastName,
      firstName: doc.firstName,
      birthday: input.birthday || input.dateOfBirth || "",
      text: doc.text,
    });
  } catch {
    // VDDS-Knopf liest die Datei nur als Fallback — Outbox bleibt die Quelle.
  }
}

export async function listOutbox(clientId, { status = "pending", limit = 80 } = {}) {
  const snap = await outboxCol(clientId)
    .where("status", "==", status || "pending")
    .limit(Math.min(200, Math.max(1, Number(limit) || 80)))
    .get();
  const rows = snap.docs.map((d) => {
    const row = { id: d.id, ...d.data() };
    if (row.text) row.text = stripLinksForPvs(row.text);
    return row;
  });
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return rows;
}

export async function markCollected(clientId, id, { dampsoftPatNr = "" } = {}) {
  const ref = outboxCol(clientId).doc(String(id || "").trim());
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error("not_found");
    err.code = "not_found";
    throw err;
  }
  const prev = snap.data() || {};
  const next = {
    ...prev,
    status: "collected",
    dampsoftPatNr: s(dampsoftPatNr) || prev.dampsoftPatNr || "",
    collectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await ref.set(next, { merge: true });
  return { id: ref.id, ...next };
}

export async function markPending(clientId, id) {
  const ref = outboxCol(clientId).doc(String(id || "").trim());
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error("not_found");
    err.code = "not_found";
    throw err;
  }
  const next = {
    status: "pending",
    collectedAt: "",
    updatedAt: new Date().toISOString(),
  };
  await ref.set(next, { merge: true });
  return { id: ref.id, ...snap.data(), ...next };
}

function splitPersonName(full) {
  const t = s(full).replace(/^—$/, "");
  if (!t) return { firstName: "", lastName: "" };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export async function enqueueFromFinalize(clientId, { text, appointment, identity } = {}) {
  const settings = await getWritePath(clientId);
  if (settings.path === "none" || !settings.active.ready) return { queued: false, reason: "no_path" };
  const ap = appointment || {};
  const p = ap.patient || {};
  const id = identity || {};
  const fromName = splitPersonName(
    id.patientName || ap.patientName || ap.name || `${p.firstName || ""} ${p.lastName || ""}`,
  );
  const pickadocId = s(id.pickadocId || id.patientId || ap.patientId || p.id);
  const locationId = s(ap.locationId || id.locationId);
  const docNames = await listSignedDocNames(clientId, locationId, pickadocId);
  const doc = await enqueueOutbox(clientId, {
    text: enrichPvsText(text, docNames),
    pickadocId,
    lastName: s(id.lastName || p.lastName) || fromName.lastName,
    firstName: s(id.firstName || p.firstName) || fromName.firstName,
    dampsoftPatNr: s(id.dampsoftPatNr || id.densPatNr || p.externalId),
    appointmentId: s(ap.id || ap.appointmentId),
    locationId,
  });
  return { queued: true, id: doc.id, path: doc.path };
}
