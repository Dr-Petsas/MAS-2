/**
 * PlanR: enthalten in MAS (wie die Plattform: crew.tier premium oder MAS an einem Standort),
 * sonst nur mit eigenem PlanR-Abo (subscriptions.planr, Standalone-Registrierung).
 * Anders als die Pickadoc-Apps ist PlanR ohne Buchung AUS – es ist ein bezahltes Zusatzprodukt.
 */
export function planrAusBilling(billing) {
  const crew = billing?.subscriptions?.crew?.tier;
  const mas = crew === "premium"
    || Object.values(billing?.locationPackages || {}).some((l) => l?.mas?.enabled === true);
  const abo = billing?.subscriptions?.planr;
  const bis = Date.parse(abo?.testaboBis ?? "");
  const testaboVorbei = abo?.testabo !== false && Number.isFinite(bis) && bis <= Date.now();
  const planr = abo?.enabled === true && !testaboVorbei;
  return {
    mas,
    planr,
    erlaubt: mas || planr,
    // Volle Clara mit MAS, sonst nur die HKP-Clara mit gebuchter Sprachsteuerung
    clara: mas ? "voll" : planr && abo?.sprachsteuerung === true ? "planr" : "aus",
    // Prosa in die Karteikarte: bei Pickadoc enthalten, sonst das PlanR-Upgrade (subscriptions.planr.doku)
    doku: mas || (planr && abo?.doku === true),
  };
}
