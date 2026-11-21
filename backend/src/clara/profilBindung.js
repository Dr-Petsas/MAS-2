// Profil-Bindung fuer /clara/session (21.11.2026).
//
// Ein Clara-Profil mit festen Werkzeug-Adressen gehoert GENAU EINER Praxis:
// clara_meddent zeigt mit jedem Werkzeug auf die Standardpraxis. Bis hierher
// bekam jede Praxis ohne eigenes Profil das Standardprofil — also eine Clara,
// die Kalender und Patienten der Standardpraxis kennt (abgelaufenes PlanR,
// gekuendigtes Abo, frei erfundene Praxis-ID; der Aufruf braucht keine
// Anmeldung).
//
// Regel:
//   - Standardpraxis: unveraendert (Wunsch des Aufrufers > eigenes Profil >
//     Standardprofil).
//   - jede andere Praxis: NUR ihr eigenes Profil aus mas_config/booking
//     (claraProfileId). Ein fremder Wunsch aendert daran nichts. Ohne eigenes
//     Profil gibt es keine Sitzung.
// Die PlanR-Clara (Profil ohne feste Praxis) wird vorher in
// hkp/planrClara.js -> sitzungsProfil entschieden und kommt hier nicht an.
//
// PUR. Notaus: MAS_PROFIL_BINDUNG=0 => Verhalten wie vorher.

export const NICHT_EINGERICHTET = "Clara ist für diese Praxis nicht eingerichtet. Bitte wenden Sie sich an Ihren Support.";

const bindungAus = () => String(process.env.MAS_PROFIL_BINDUNG || "").trim() === "0";

/**
 * @param {{clientId: string, gewuenscht?: string, eigenes?: string, standardClient: string, standardProfil: string}} p
 * @returns {{profileId: string} | {gesperrt: true, message: string}}
 */
export function profilFuerPraxis({ clientId, gewuenscht, eigenes, standardClient, standardProfil }) {
  const id = String(clientId || "").trim();
  const wunsch = String(gewuenscht || "").trim();
  const eigen = String(eigenes || "").trim();
  if (bindungAus() || (id && id === String(standardClient || "").trim())) {
    return { profileId: wunsch || eigen || standardProfil };
  }
  if (eigen) return { profileId: eigen };
  return { gesperrt: true, message: NICHT_EINGERICHTET };
}

/**
 * Die ganze Profil-Entscheidung von /clara/session an EINER Stelle: erst die
 * PlanR-Clara (erzwingt ihr Profil oder sperrt), dann die Profil-Bindung.
 * `planrProfil` und `ladeBooking` werden hereingereicht, damit die Funktion
 * ohne Firestore pruefbar bleibt.
 * @returns {Promise<{profileId: string} | {gesperrt: true, error: string, message: string}>}
 */
export async function sitzungsEntscheidung({ clientId, gewuenscht, planrProfil, ladeBooking, standardClient, standardProfil }) {
  const wunsch = String(gewuenscht || "").trim();
  const planr = await planrProfil(clientId, wunsch);
  if (planr.gesperrt) return { gesperrt: true, error: "clara_nicht_gebucht", message: planr.message };
  if (planr.zugang === "planr") return { profileId: planr.profileId };
  const standard = String(clientId || "").trim() === String(standardClient || "").trim();
  // Standardpraxis mit ausdruecklichem Wunsch: kein Lesen noetig (wie vorher).
  const booking = standard && wunsch ? null : await ladeBooking(clientId).catch(() => null);
  const wahl = profilFuerPraxis({ clientId, gewuenscht: wunsch, eigenes: booking?.claraProfileId, standardClient, standardProfil });
  if (wahl.gesperrt) return { gesperrt: true, error: "clara_nicht_eingerichtet", message: wahl.message };
  return { profileId: wahl.profileId };
}
