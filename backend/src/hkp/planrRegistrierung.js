/**
 * PlanR-Buchung ohne MAS: legt die Praxis in Pickadoc an (Client, Standort, Admin-Konto mit dem in der Buchung
 * gewählten Passwort) und setzt das Abo subscriptions.planr – die Praxis kann sich sofort in PlanR anmelden.
 * Bewusst schlank: keine Kalender, Demo-Daten oder Registrierungs-Mails wie im Pickadoc-Wizard.
 * Notaus: MAS_PLANR_REGISTRIEREN=0.
 */
import admin, { db as firestore } from "../firebase.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (x, max = 120) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export class RegistrierungFehler extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function eingabePruefen(b) {
  const email = text(b?.email, 200).toLowerCase();
  const passwort = String(b?.passwort ?? "");
  const vorname = text(b?.vorname, 80);
  const nachname = text(b?.nachname, 80);
  const p = b?.praxis || {};
  const praxis = { name: text(p.name, 160), strasse: text(p.strasse), plz: text(p.plz, 5), ort: text(p.ort) };
  if (!EMAIL_RE.test(email)) throw new RegistrierungFehler("email", 400, "Ungültige E-Mail-Adresse.");
  if (passwort.length < 8 || passwort.length > 128) throw new RegistrierungFehler("passwort", 400, "Das Passwort braucht mindestens 8 Zeichen.");
  if (!vorname || !nachname || !praxis.name) throw new RegistrierungFehler("angaben", 400, "Name und Praxisname fehlen.");
  return {
    email, passwort, vorname, nachname, praxis,
    titel: text(b?.titel, 40),
    sprachsteuerung: b?.sprachsteuerung === true,
    doku: b?.doku === true,
    paket: text(b?.paket, 30),
    buchung: text(b?.buchung, 40),
    mandatsreferenz: text(b?.mandatsreferenz, 35),
    testaboBis: /^\d{4}-\d{2}-\d{2}T/.test(String(b?.testaboBis ?? "")) ? String(b.testaboBis).slice(0, 40) : "",
  };
}

const planrAbo = (e, jetzt) => ({
  enabled: true, sprachsteuerung: e.sprachsteuerung, doku: e.doku, paket: e.paket, seit: jetzt.toISOString(),
  buchung: e.buchung, mandatsreferenz: e.mandatsreferenz,
  ...(e.testaboBis ? { testabo: true, testaboBis: e.testaboBis } : { testabo: false }),
});

/** PlanR an einer bestehenden Praxis einschalten. Andere Abos und useEntitlements bleiben. */
async function planrAboSetzen(db, clientId, e, jetzt) {
  const blatt = db.collection("clients").doc(clientId).collection("settings").doc("billing");
  const felder = {
    "subscriptions.planr.enabled": true,
    "subscriptions.planr.sprachsteuerung": e.sprachsteuerung,
    "subscriptions.planr.doku": e.doku,
    "subscriptions.planr.paket": e.paket,
    "subscriptions.planr.seit": jetzt.toISOString(),
    "subscriptions.planr.buchung": e.buchung,
    "subscriptions.planr.mandatsreferenz": e.mandatsreferenz,
    "subscriptions.planr.testabo": e.testaboBis ? true : false,
    updatedAt: jetzt.toISOString(),
  };
  if (e.testaboBis) felder["subscriptions.planr.testaboBis"] = e.testaboBis;
  try {
    await blatt.update(felder);
  } catch (err) {
    const fehlt = err?.code === 5 || err?.code === "not-found" || /not[- ]found/i.test(String(err?.message || ""));
    if (!fehlt) throw err;
    await blatt.set({
      schemaVersion: "2.0", source: "planr-buchung", useEntitlements: true, updatedAt: jetzt.toISOString(),
      subscriptions: { planr: planrAbo(e, jetzt) },
    }, { merge: true });
  }
}

/** Neue Praxis zu einer Nutzer-Id. Das Pickadoc-Konto legt der Aufrufer an und räumt es bei einem Fehler selbst ab. */
async function praxisAnlegen(db, auth, e, uid, jetzt) {
  const client = db.collection("clients").doc();
  const ort = client.collection("locations").doc();
  const anschrift = { street: e.praxis.strasse, postalCode: e.praxis.plz, city: e.praxis.ort, state: "", country: "de" };
  try {
    await client.set({
      name: e.praxis.name, ...anschrift, isEnabled: true, isDeleted: false, createdAt: jetzt, medicalSpecialties: ["dentist"],
      userIds: [uid], languages: ["Deutsch"], locations: [{ id: ort.id, name: e.praxis.name, isEnabled: true }],
      source: "planr-buchung", planrBuchung: e.buchung, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await ort.set({ id: ort.id, clientId: client.id, name: e.praxis.name, ...anschrift, isEnabled: true, userIds: [uid], createdAt: jetzt });
    await client.collection("users").doc(uid).set({
      id: uid, clientId: client.id, locationId: ort.id, locationName: e.praxis.name,
      title: e.titel, firstName: e.vorname, lastName: e.nachname, email: e.email,
      role: "doctor", isAdmin: true, allowOnlineAppointments: false, createdAt: jetzt,
    });
    await client.collection("settings").doc("billing").set({
      schemaVersion: "2.0", source: "planr-buchung", useEntitlements: true,
      locationPackages: { [ort.id]: { frontdesk: { enabled: false }, mas: { enabled: false } } },
      updatedAt: jetzt.toISOString(),
      subscriptions: { planr: planrAbo(e, jetzt) },
    }, { merge: true });
    await auth.setCustomUserClaims(uid, { role: "admin", isAdmin: true, clientId: client.id });
  } catch (err) {
    for (const ref of [client.collection("users").doc(uid), client.collection("settings").doc("billing"), ort, client]) await ref.delete().catch(() => undefined);
    throw err;
  }
  return { clientId: client.id, locationId: ort.id };
}

/**
 * @returns {Promise<{clientId: string, uid: string, locationId: string, wieder?: boolean}>}
 * Fehler: RegistrierungFehler (konto_gesperrt 403, abgeschaltet 503, Eingaben 400).
 * Ein schon vorhandenes Pickadoc-Konto wird nicht gelöscht und nicht ersetzt. Die Buchung setzt das
 * gerade gewählte Passwort, schaltet PlanR an der bestehenden Praxis an und gibt deren Kennung zurück.
 * Ohne Praxis entsteht eine neue, an dasselbe Konto gehängt.
 */
export async function praxisRegistrieren(roh, { auth = admin.auth(), db = firestore, jetzt = new Date() } = {}) {
  if (process.env.MAS_PLANR_REGISTRIEREN === "0") throw new RegistrierungFehler("abgeschaltet", 503, "Die Selbstanmeldung ist abgeschaltet.");
  const e = eingabePruefen(roh);
  const alt = await auth.getUserByEmail(e.email).then((u) => u, (err) => {
    if (err?.code === "auth/user-not-found") return null;
    throw err;
  });
  if (alt?.disabled) throw new RegistrierungFehler("konto_gesperrt", 403, "Dieses Pickadoc-Konto ist gesperrt.");
  if (alt) {
    const uid = alt.uid;
    let clientId = text(alt.customClaims?.clientId, 128);
    let locationId = text(alt.customClaims?.locationId, 128);
    if (!clientId) {
      const neu = await praxisAnlegen(db, auth, e, uid, jetzt);
      clientId = neu.clientId;
      locationId = neu.locationId;
    } else {
      await planrAboSetzen(db, clientId, e, jetzt);
    }
    await auth.updateUser(uid, { password: e.passwort });
    return { clientId, uid, locationId, wieder: true };
  }

  const name = [e.titel, e.vorname, e.nachname].filter(Boolean).join(" ");
  const nutzer = await auth.createUser({ email: e.email, password: e.passwort, displayName: name, emailVerified: false, disabled: false });
  try {
    const neu = await praxisAnlegen(db, auth, e, nutzer.uid, jetzt);
    return { clientId: neu.clientId, uid: nutzer.uid, locationId: neu.locationId };
  } catch (err) {
    await auth.deleteUser(nutzer.uid).catch(() => undefined);
    throw err;
  }
}

/**
 * Liest eine bestehende Praxis zur E-Mail. Legt nichts an und ändert das Pickadoc-Konto nicht.
 * @returns {Promise<{email: string, clientId: string, uid: string, name: string} | null>}
 */
export async function kontoNachEmail(email, { auth = admin.auth() } = {}) {
  const e = text(email, 200).toLowerCase();
  if (!EMAIL_RE.test(e)) return null;
  const user = await auth.getUserByEmail(e).then((u) => u, (err) => {
    if (err?.code === "auth/user-not-found") return null;
    throw err;
  });
  const clientId = text(user?.customClaims?.clientId, 128);
  if (!user || !clientId) return null;
  return { email: e, clientId, uid: text(user.uid, 128), name: text(user.displayName, 160) };
}

/** Reguläres Abo: das Testende am Billing löschen, PlanR bleibt an. */
export async function testaboFreigeben(clientId, { mandatsreferenz = "" } = {}, { db = firestore } = {}) {
  if (!clientId) return;
  await db.collection("clients").doc(clientId).collection("settings").doc("billing").update({
    "subscriptions.planr.testabo": false,
    "subscriptions.planr.testaboBis": admin.firestore.FieldValue.delete(),
    "subscriptions.planr.mandatsreferenz": String(mandatsreferenz || "").slice(0, 35),
    updatedAt: new Date().toISOString(),
  });
}
