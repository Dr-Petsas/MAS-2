import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// ============================================================================
// Praxis-Verzeichnis — die Kollegen der Praxis mit ihren echten Kontaktdaten.
//
// Chef-Vorfall 27.07.2026: "Wieso findet Clara die Kontaktdaten von Dr. Petsas
// nicht?" Weil es sie nirgends FEST gab. Clara suchte zuerst in der
// Patientenkartei (dort liegen Alt-/Testdatensaetze "Michael Petsas",
// "Dr. Petsas", "Michael Petsassss") und fragte deshalb zurueck, statt zu
// antworten. Das geteilte Adressbuch (mas_contacts) half auch nicht: es
// entsteht aus Mail-Signaturen und Anrufen, ist also Zufallsfund und wird
// laufend ueberschrieben.
//
// Dieses Verzeichnis ist die EINE gepflegte Quelle fuer Kollegen:
// clients/{clientId}/mas_config/directory. Es wird von keinem Import
// ueberschrieben und ueberlebt jede Mail-Synchronisation.
//
// Bewusste Trennung:
//   Patienten      -> Patientenkartei (search_patient/contact_card)
//   Externe        -> geteiltes Adressbuch (mas_contacts, waechst von allein)
//   Eigenes Team   -> HIER (Aerzte, Praxisleitung; von Hand gepflegt)
// ============================================================================

const FieldValue = admin.firestore.FieldValue;

function dirDoc(clientId) {
  return masCollection(clientId, "mas_config").doc("directory");
}

/** Titel/Anrede weg, Kleinschreibung, Umlaute gefaltet — "Dr. Petsas" -> "petsas". */
export function foldName(raw) {
  let s = String(raw || "").toLowerCase();
  s = s.replace(/\b(dr|dr\.|doktor|prof|prof\.|herr|herrn|frau|kollege|kollegin)\b\.?/g, " ");
  for (const [a, b] of [["ä", "ae"], ["ö", "oe"], ["ü", "ue"], ["ß", "ss"]]) s = s.split(a).join(b);
  return s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Spricht der Satz einen KOLLEGEN an ("Dr. Petsas", "Doktor Patrikis")? */
export function hasColleagueTitle(raw) {
  return /\b(dr|doktor|prof|kollege|kollegin)\b\.?/i.test(String(raw || ""));
}

function normalizeEntry(e) {
  const name = String(e?.name || "").trim();
  if (!name) return null;
  return {
    name,
    role: String(e?.role || "").trim() || "Arzt/Ärztin",
    mobile: String(e?.mobile || "").trim(),
    phone: String(e?.phone || "").trim(),
    email: String(e?.email || "").trim(),
    calendarName: String(e?.calendarName || "").trim(),
    note: String(e?.note || "").trim(),
  };
}

/** Alle Verzeichnis-Eintraege (leer, wenn nie gepflegt). */
export async function listDirectory(clientId) {
  const snap = await dirDoc(clientId).get();
  if (!snap.exists) return [];
  return (snap.data()?.entries || []).map(normalizeEntry).filter(Boolean);
}

/**
 * Eintrag anlegen oder ergaenzen (Schluessel ist der gefaltete Name).
 * Leere Felder ueberschreiben NIE einen vorhandenen Wert.
 */
export async function upsertDirectoryEntry(clientId, entry) {
  const neu = normalizeEntry(entry);
  if (!neu) throw new Error("name required");
  const alle = await listDirectory(clientId);
  const key = foldName(neu.name);
  const i = alle.findIndex((e) => foldName(e.name) === key);
  if (i >= 0) {
    const alt = alle[i];
    alle[i] = {
      ...alt,
      ...Object.fromEntries(Object.entries(neu).filter(([, v]) => String(v || "").trim())),
    };
  } else {
    alle.push(neu);
  }
  await dirDoc(clientId).set({ entries: alle, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return alle[i >= 0 ? i : alle.length - 1];
}

/** Eintrag entfernen. */
export async function removeDirectoryEntry(clientId, name) {
  const key = foldName(name);
  const alle = await listDirectory(clientId);
  const rest = alle.filter((e) => foldName(e.name) !== key);
  await dirDoc(clientId).set({ entries: rest, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { removed: alle.length - rest.length };
}

/**
 * Kollegen-Treffer zu einem gesprochenen Namen. Erst voller Name, dann
 * Nachname — beides ueber gefaltete Wortteile, damit "Doktor Petsas",
 * "Petsas" und "Michael Petsas" denselben Eintrag treffen.
 *
 * @returns {Promise<object|null>} Eintrag oder null
 */
export async function findDirectoryContact(clientId, name) {
  const gesucht = foldName(name);
  if (!gesucht) return null;
  const alle = await listDirectory(clientId);
  if (!alle.length) return null;

  const teile = gesucht.split(" ").filter((t) => t.length >= 3);
  for (const e of alle) {
    if (foldName(e.name) === gesucht) return e;
  }
  for (const e of alle) {
    const eigene = foldName(e.name).split(" ").filter(Boolean);
    // Nachname (letztes Wort) muss treffen — "Peter" allein oeffnet keinen
    // Kollegen-Eintrag, "Petsas" schon.
    const nach = eigene[eigene.length - 1];
    if (nach && teile.includes(nach)) return e;
  }
  return null;
}

/** Gesprochene Kurzform fuer Claras Antwort. */
export function spokenDirectoryEntry(e) {
  const bits = [];
  if (e.mobile) bits.push(`mobil ${e.mobile}`);
  if (e.phone) bits.push(`Festnetz ${e.phone}`);
  if (e.email) bits.push(`E-Mail ${e.email}`);
  return bits.join(", ");
}
