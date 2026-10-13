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
    paket: text(b?.paket, 30),
    buchung: text(b?.buchung, 40),
    mandatsreferenz: text(b?.mandatsreferenz, 35),
  };
}

/**
 * @returns {Promise<{clientId: string, uid: string, locationId: string}>}
 * Fehler: RegistrierungFehler (konto_vorhanden 409, abgeschaltet 503, Eingaben 400).
 */
export async function praxisRegistrieren(roh, { auth = admin.auth(), db = firestore, jetzt = new Date() } = {}) {
  if (process.env.MAS_PLANR_REGISTRIEREN === "0") throw new RegistrierungFehler("abgeschaltet", 503, "Die Selbstanmeldung ist abgeschaltet.");
  const e = eingabePruefen(roh);
  const vorhanden = await auth.getUserByEmail(e.email).then(() => true, (err) => {
    if (err?.code === "auth/user-not-found") return false;
    throw err;
  });
  if (vorhanden) throw new RegistrierungFehler("konto_vorhanden", 409, "Für diese E-Mail-Adresse gibt es schon ein Pickadoc-Konto.");

  const name = [e.titel, e.vorname, e.nachname].filter(Boolean).join(" ");
  const nutzer = await auth.createUser({ email: e.email, password: e.passwort, displayName: name, emailVerified: false, disabled: false });
  const uid = nutzer.uid;
  const client = db.collection("clients").doc();
  const ort = client.collection("locations").doc();
  try {
    const anschrift = { street: e.praxis.strasse, postalCode: e.praxis.plz, city: e.praxis.ort, state: "", country: "de" };
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
      subscriptions: {
        planr: {
          enabled: true, sprachsteuerung: e.sprachsteuerung, paket: e.paket, seit: jetzt.toISOString(),
          buchung: e.buchung, mandatsreferenz: e.mandatsreferenz,
        },
      },
    }, { merge: true });
    await auth.setCustomUserClaims(uid, { role: "admin", isAdmin: true, clientId: client.id });
  } catch (err) {
    await auth.deleteUser(uid).catch(() => undefined);
    for (const ref of [client.collection("users").doc(uid), client.collection("settings").doc("billing"), ort, client]) await ref.delete().catch(() => undefined);
    throw err;
  }
  return { clientId: client.id, uid, locationId: ort.id };
}
