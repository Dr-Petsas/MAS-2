// Erzeugt aus qm-knowledge.json eine gut lesbare HTML-Ansicht (nur Lese-Hilfe
// zum Gegenlesen, kein Live-Effekt). Aufruf: node backend/scripts/qm-knowledge-view.mjs
// Schreibt qm-knowledge-view.html neben dieses Skript und gibt den Pfad aus.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = join(here, "..", "src", "data", "qm", "qm-knowledge.json");
const outPath = join(here, "qm-knowledge-view.html");
const d = JSON.parse(readFileSync(dataPath, "utf8"));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const CYCLE = {
  perUse: "pro Nutzung", perCharge: "pro Charge", workday: "arbeitstaeglich", daily: "taeglich",
  weekly: "woechentlich", biweekly: "14-taegig", monthly: "monatlich", quarterly: "vierteljaehrlich",
  halfYearly: "halbjaehrlich", yearly: "jaehrlich", twoYearly: "alle 2 Jahre", fiveYearly: "alle 5 Jahre",
  onEvent: "anlassbezogen",
};
const cyc = (c) => CYCLE[c] || c || "";
const months = (m) => (m ? `${m} Mon.` : "-");

function badge(txt, cls = "") { return `<span class="badge ${cls}">${esc(txt)}</span>`; }

function planCard(p) {
  const pflicht = p.pflicht === "immer" ? badge("Pflicht", "req")
    : p.pflicht === "empfohlen" ? badge("Empfohlen", "rec")
    : badge(esc(p.pflicht || "optional"), "cond");
  const teilbar = p.teilbar ? badge("teilbar (Praxen)", "shared") : "";
  const jobs = (p.erzeugtJobs || []).map((j) => `
      <tr>
        <td>${esc(j.titel)}</td>
        <td>${esc(cyc(j.cycle))}</td>
        <td>${esc(j.rolle || "")}</td>
        <td>${esc(j.typ || "")}</td>
        <td>${j.leadDays != null ? esc(j.leadDays) + " T" : ""}</td>
      </tr>`).join("");
  const inv = p.inventar ? (() => {
    const felder = (p.inventar.felder || []).map((f) => `<li><b>${esc(f.label)}</b> <span class="key">${esc(f.type)}</span>${f.required ? " (Pflicht)" : ""}${Array.isArray(f.options) ? ` — ${esc(f.options.join(", "))}` : ""}</li>`).join("");
    const itemJobs = (p.inventar.erzeugtProItem || []).map((j) => `
        <tr>
          <td>${esc(j.titel)}</td>
          <td>${esc(cyc(j.cycle))}${j.cycleFromFeld ? ` <span class="key">aus ${esc(j.cycleFromFeld)}</span>` : ""}</td>
          <td>${esc(j.rolle || "")}</td>
          <td>${j.ankerFeld ? `<span class="key">Anker: ${esc(j.ankerFeld)}</span>` : "ab Erstellung"}</td>
          <td>${j.leadDays != null ? esc(j.leadDays) + " T" : ""}</td>
        </tr>`).join("");
    return `
      <div class="inv">
        <div class="inv-h">Individuelle Liste: <b>${esc(p.inventar.label)}</b></div>
        <div class="inv-q">Interview fragt: „${esc(p.inventar.frageAnzahl)}" → dann pro Objekt:</div>
        <ul class="inv-f">${felder}</ul>
        ${itemJobs ? `<table class="jobs"><thead><tr><th>Job je Objekt</th><th>Zyklus</th><th>Rolle</th><th>Naechster Termin</th><th>Vorlauf</th></tr></thead><tbody>${itemJobs}</tbody></table>` : ""}
      </div>`;
  })() : "";
  return `
    <div class="plan">
      <div class="plan-h">
        <div class="plan-title">${esc(p.titel)} <span class="key">${esc(p.artifactKey)}</span></div>
        <div class="badges">${pflicht} ${badge("Review " + months(p.reviewIntervalMonths))} ${teilbar} ${p.interviewKey ? badge("Interview", "iv") : ""}</div>
      </div>
      <div class="zweck">${esc(p.zweck)}</div>
      <div class="meta">
        <span><b>Verantwortlich:</b> ${esc(p.verantwortlicheRolle || "-")}</span>
        <span><b>Rechtsstand:</b> ${esc(p.rechtsstand || "-")}</span>
      </div>
      ${p.intervallHinweis ? `<div class="hint">Hinweis: ${esc(p.intervallHinweis)}</div>` : ""}
      ${p.materialhinweis ? `<div class="mat"><b>Material:</b> ${esc(p.materialhinweis)}</div>` : ""}
      ${inv}
      ${jobs ? `<table class="jobs"><thead><tr><th>Erzeugter Job</th><th>Zyklus</th><th>Rolle</th><th>Typ</th><th>Vorlauf</th></tr></thead><tbody>${jobs}</tbody></table>` : ""}
    </div>`;
}

function categorySection(c) {
  const sources = (c.rechtsgrundlagen || []).map((r) => `<li><b>${esc(r.kurz)}</b> — ${esc(r.fundstelle)}</li>`).join("");
  return `
    <section class="cat">
      <h2>${esc(c.label)} <span class="key">${esc(c.key)}</span></h2>
      <div class="cat-officer">Beauftragte/r: <b>${esc(c.beauftragter || "-")}</b></div>
      ${sources ? `<details class="src"><summary>Rechtsgrundlagen (${(c.rechtsgrundlagen || []).length})</summary><ul>${sources}</ul></details>` : ""}
      ${(c.plaene || []).map(planCard).join("")}
    </section>`;
}

const forms = (d.praxisformen?.formen || []).map((f) => `<li><b>${esc(f.label)}</b> — QM-Einheiten: ${esc(f.qmEinheiten)}. ${esc(f.hinweis)}</li>`).join("");
const dedup = (d.geteilteJobsPolicy?.regeln || []).map((r) => `<li>${esc(r)}</li>`).join("");
const klassen = (d.reprozessierungsKlassen?.klassen || []).map((k) => `<li><b>${esc(k.label)}</b> — ${esc(k.beschreibung)}</li>`).join("");
const beauftragte = (d.beauftragte?.rollen || []).map((b) => `<li><b>${esc(b.label)}</b> — ${esc((b.kategorien || []).join(", "))}${b.pflichtWenn ? ` (Pflicht wenn: ${esc(b.pflichtWenn)})` : ""} — ${esc(b.grundlage || "")}</li>`).join("");

let plans = 0;
for (const c of d.kategorien || []) plans += (c.plaene || []).length;

const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>QM-Wissensbasis — Stand ${esc(d._meta?.stand)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #1b1d22; color: #dfe3ea; font: 15px/1.55 -apple-system, Segoe UI, Roboto, sans-serif; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 28px 20px 80px; }
  header.top { border-bottom: 1px solid #333842; padding-bottom: 18px; margin-bottom: 22px; }
  header.top h1 { margin: 0 0 6px; font-size: 24px; }
  .sub { color: #9aa3af; }
  .disclaimer { background: #2a2d34; border-left: 3px solid #b45309; padding: 10px 14px; border-radius: 6px; margin: 14px 0; color: #e7c98a; font-size: 13.5px; }
  .toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 4px; }
  .toc a { background: #262a31; color: #cbd2dc; text-decoration: none; padding: 5px 11px; border-radius: 999px; font-size: 13px; border: 1px solid #333842; }
  .toc a:hover { background: #303640; }
  section.block { background: #23262d; border: 1px solid #313742; border-radius: 10px; padding: 16px 18px; margin: 16px 0; }
  section.block h3 { margin: 0 0 10px; font-size: 16px; color: #b9c2cf; }
  section.block ul { margin: 0; padding-left: 20px; } section.block li { margin: 4px 0; }
  section.cat { margin: 30px 0 10px; }
  section.cat > h2 { font-size: 20px; border-bottom: 1px solid #333842; padding-bottom: 8px; }
  .cat-officer { color: #9aa3af; margin: 2px 0 8px; font-size: 13.5px; }
  details.src { margin: 4px 0 12px; } details.src summary { cursor: pointer; color: #8fb3ff; font-size: 13.5px; }
  details.src ul { margin: 8px 0 0; padding-left: 20px; color: #b7bdc7; font-size: 13.5px; }
  .key { font: 12px ui-monospace, Menlo, monospace; color: #7b8494; background: #1b1d22; padding: 1px 6px; border-radius: 5px; border: 1px solid #313742; }
  .plan { background: #23262d; border: 1px solid #313742; border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
  .plan-h { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: baseline; }
  .plan-title { font-size: 16px; font-weight: 700; }
  .zweck { color: #c3cad4; margin: 6px 0 8px; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; color: #9aa3af; font-size: 13px; }
  .hint { color: #e7c98a; font-size: 13px; margin-top: 6px; }
  .mat { color: #a7b0bc; font-size: 13px; margin-top: 6px; }
  .badges { display: flex; gap: 6px; flex-wrap: wrap; }
  .badge { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: #303640; color: #cbd2dc; white-space: nowrap; }
  .badge.req { background: #3a2323; color: #f4a3a3; } .badge.rec { background: #3a331f; color: #e7c98a; }
  .badge.cond { background: #243244; color: #93b7e8; } .badge.shared { background: #223a33; color: #86d6b3; }
  .badge.iv { background: #2e2540; color: #c3a7f0; }
  table.jobs { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  table.jobs th, table.jobs td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #2c313a; }
  table.jobs th { color: #8b93a0; font-weight: 600; }
  .inv { margin-top: 10px; background: #1f2733; border: 1px solid #2f3a49; border-radius: 8px; padding: 10px 12px; }
  .inv-h { color: #86b7e8; font-size: 13.5px; } .inv-q { color: #a7b0bc; font-size: 13px; margin: 4px 0; }
  .inv-f { margin: 4px 0 6px; padding-left: 20px; font-size: 13px; color: #c3cad4; } .inv-f li { margin: 2px 0; }
</style></head>
<body><div class="wrap">
  <header class="top">
    <h1>QM-Wissensbasis (Julia)</h1>
    <div class="sub">Version ${esc(d._meta?.version)} · Stand ${esc(d._meta?.stand)} · ${esc(d.kategorien?.length)} Kategorien · ${plans} Plaene</div>
    <div class="disclaimer">${esc(d._meta?.rechtlicherHinweis)}</div>
    <div class="toc">${(d.kategorien || []).map((c) => `<a href="#cat-${esc(c.key)}">${esc(c.label)}</a>`).join("")}</div>
  </header>

  <section class="block"><h3>Praxisformen</h3><ul>${forms}</ul></section>
  <section class="block"><h3>Beauftragte</h3><ul>${beauftragte}</ul></section>
  <section class="block"><h3>Reprozessierungs-Klassen (Aufbereitung)</h3><ul>${klassen}</ul></section>
  <section class="block"><h3>Regelwerk: geteilte Jobs / kein Push-Spam</h3><ul>${dedup}</ul></section>

  ${(d.kategorien || []).map((c) => `<a id="cat-${esc(c.key)}"></a>` + categorySection(c)).join("")}
</div></body></html>`;

writeFileSync(outPath, html, "utf8");
console.log(outPath);
