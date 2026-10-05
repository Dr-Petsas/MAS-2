// Einmal-Skript: SignR-Vorlage "Einverständniserklärung ABZ-ZR Factoring"
// für den Thaler-Account. Standard = nur lesen. Schreiben nur mit --write.
// Bestehende pdocuments werden NICHT geändert oder gelöscht.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import admin from "../src/firebase.js";

const WRITE = process.argv.includes("--write");
const DOC_ID = "einverstaendnis-abz-zr-factoring";
const DOC_NAME = "Einverständniserklärung ABZ-ZR Factoring";
const ACCENT = "#E05656";

const db = admin.firestore();

function id() {
  return randomUUID();
}

function labels(de) {
  return [{ key: "de", value: de }];
}

function row(columns) {
  const rid = id();
  return {
    id: rid,
    columns: columns.map((col) => ({ ...col, parentId: rid, id: col.id || id() })),
  };
}

function headline(text, textSize = 2) {
  return { type: 1, labels: labels(text), textSize, textAlign: 0 };
}

function paragraph(html) {
  return { type: 2, labels: labels(html) };
}

function inputText(label, required = false) {
  return {
    type: 5,
    labels: labels(label),
    required,
    inputUser: "patient",
  };
}

function radio(label, answers, required = false) {
  const rid = id();
  return {
    id: rid,
    type: 8,
    labels: labels(label),
    required,
    inputUser: "patient",
    answers: answers.map((a) => {
      const aid = id();
      const nested = (a.fields || []).map((field) => {
        const nestedRow = id();
        return {
          id: nestedRow,
          columns: [
            {
              ...field,
              id: field.id || id(),
              parentId: nestedRow,
            },
          ],
        };
      });
      return {
        id: aid,
        parentId: rid,
        type: 14,
        labels: labels(a.label),
        required: false,
        formRows: nested,
      };
    }),
  };
}

function signature(label) {
  return {
    type: 9,
    labels: labels(label),
    required: true,
    inputUser: "patient",
    autoSign: false,
  };
}

function line() {
  return {
    type: 12,
    labels: [],
    lineWidth: 100,
    lineThickness: 3,
    lineAlign: 1,
    spaceBefore: 4,
    spaceAfter: 8,
    lineBorderColor: ACCENT,
    lineBorderStyle: "solid",
  };
}

const CONSENT_LEFT = `<p><strong>Ich erkläre mich einverstanden mit der</strong></p>
<ul>
<li>Weitergabe der zur Abrechnung und Geltendmachung der Forderungen jeweils erforderlichen Informationen, insbesondere von Daten aus der Patientenkartei (Name, Geburtsdatum, Anschrift, Befunde, Behandlungsdaten und -verläufe), an die ABZ Zahnärztliches Rechenzentrum für Bayern GmbH (ABZ-ZR) und der dort vorzunehmenden Verarbeitung dieser Daten.</li>
<li>möglichen Einholung einer Information durch ABZ-ZR bei einer Auskunftei zur Prüfung meiner Bonität. Die Praxis und/oder ABZ-ZR teilen auf Nachfrage Name und Adresse der Auskunftei mit.</li>
<li>Abtretung der sich aus allen Behandlungen ergebenden Forderungen an ABZ-ZR.</li>
<li>im Rahmen der Refinanzierung erfolgenden Weiterabtretung der Forderungen durch ABZ-ZR an die DZ BANK AG Deutsche Zentral-Genossenschaftsbank, Frankfurt am Main (DZ BANK), wobei mir bewusst ist, dass die DZ BANK in diesem Zusammenhang Einsicht in die von der Praxis erteilten, erforderlichen Informationen gemäß dem ersten Absatz verlangen könnte.</li>
</ul>`;

const CONSENT_RIGHT = `<p>Ich wurde darüber aufgeklärt, dass ABZ-ZR die Leistungen meiner Praxis mir, meiner Krankenkasse (bei vereinbarter Direktabrechnung) oder dem zuständigen Kostenträger (Leistungen der gesetzl. Unfallversicherung/Sozialhilfe etc.) gegenüber im eigenen Namen in Rechnung stellen und für sich geltend machen wird. Sollte es über die Berechtigung der Forderungen unterschiedliche Auffassungen geben, kann die Zahnärztin/Ärztin, der Zahnarzt/Arzt in einer etwaigen Auseinandersetzung als Zeugin/Zeuge gehört werden.</p>
<p>Ich entbinde meine Zahnärztin/Ärztin, meinen Zahnarzt/Arzt sowie ABZ-ZR von der Schweigepflicht, soweit dies für die Abrechnung, Prüfung und Geltendmachung der Forderungen erforderlich ist; auch zugunsten der DZ BANK.</p>
<p>Diese Zustimmung kann jederzeit – allerdings nur mit Wirkung für die Zukunft – widerrufen werden. Der Widerruf ist entweder gegenüber der Praxis oder ABZ-ZR zu erklären.</p>
<p>Die Informationen zur Rechnung und zum Datenschutz habe ich zur Kenntnis genommen. Eine Kopie dieser Einverständniserklärung habe ich erhalten.</p>`;

const RELATIVE_INTRO = `<p><strong>Ggf. gesetzl. Vertreter/-in* oder abweichende/-r Rechnungsempfänger/-in</strong></p>
<p>Nur ausfüllen, wenn ein Angehöriger oder gesetzlicher Vertreter unterschreibt – zum Beispiel für ein Kind, die Mutter oder eine betreute Person. Unterschreiben Sie für sich selbst, lassen Sie die Felder leer.</p>`;

const RELATIVE_NOTES = `<p><em>* bei Personen unter 18 Jahren / Geschäftsunfähigen / beschränkt Geschäftsfähigen<br>
** Bei gemeinsamem Sorgerecht wird die nachstehende Erklärung auch im Namen des anderen Elternteils abgegeben.</em></p>`;

const INFO_LEFT = `<p>Liebe Patientin, lieber Patient,</p>
<p>das Wichtigste für Ihren Behandlungserfolg ist, dass Ihre Praxis sich zu 100 Prozent auf Sie konzentrieren kann. Um hierfür möglichst viel Zeit zu haben, hat Ihre Praxis die Abrechnung der ABZ Zahnärztliches Rechenzentrum für Bayern GmbH (ABZ-ZR) übertragen. Die Rechnungsstellung über ABZ-ZR ist für Sie selbstverständlich kostenlos.</p>
<p>ABZ-ZR gewährleistet die korrekte Bearbeitung der von Ihrer Praxis vorgegebenen Rechnungen. Aufgrund jahrzehntelanger Erfahrung in der Abrechnung entlastet ABZ-ZR Ihre Praxis deutlich bei den Verwaltungstätigkeiten. Die eingesparte Zeit kommt somit voll und ganz Ihnen zugute.</p>
<p>Für Ihre Fragen zur Abrechnung stehen Ihnen die kompetenten Mitarbeiter von ABZ-ZR gerne zur Verfügung. Insbesondere helfen Ihnen die Experten bei der Durchsetzung Ihrer Erstattungsansprüche gegenüber Krankenkassen oder anderen Kostenträgern. Zusätzlich bietet Ihnen ABZ-ZR an, Ihre Rechnung in Teilbeträgen zu begleichen.</p>`;

const INFO_RIGHT = `<p>Nach geltender Rechtslage ist es erforderlich, dass Sie Ihre Einwilligung mit diesem Abrechnungsweg schriftlich erklären. Daher bitten wir Sie um Ihre Zustimmung. Bitte unterschreiben Sie hierzu die Einverständniserklärung. ABZ-ZR wird Ihre Daten zu den vorgenannten Zwecken auf Grundlage dieser Einverständniserklärung verarbeiten.</p>
<p>Selbstverständlich ist ABZ-ZR gesetzlich zur Verschwiegenheit verpflichtet. Darüber wacht der Datenschutzbeauftragte von ABZ-ZR. Weitere Informationen zum Datenschutz und zu Ihren Rechten entnehmen Sie bitte dem Merkblatt „Informationen zum Datenschutz“, das Ihnen Ihre Praxis gerne überlässt, oder unter <a href="https://www.abz-zr.de/dsgvo" target="_blank" rel="noopener">www.abz-zr.de/dsgvo</a>.</p>
<p>Herzlichen Dank für Ihr Vertrauen.</p>`;

const INFO_CONTACT = `<p><strong>Kontaktdaten von ABZ-ZR und des Datenschutzbeauftragten</strong></p>
<p>ABZ Zahnärztliches Rechenzentrum für Bayern GmbH<br>
Oppelner Straße 3<br>
82194 Gröbenzell<br>
Telefon 08142 6520-6<br>
Telefax 08142 6520-892</p>
<p>Datenschutzbeauftragter ABZ-ZR<br>
Oppelner Str. 3 · 82194 Gröbenzell<br>
E-Mail datenschutz@abz-zr.de<br>
<a href="https://www.abz-zr.de" target="_blank" rel="noopener">www.abz-zr.de</a></p>
<p><em>ABZ_EE-1_V14 09/21</em></p>`;

function buildFormRows() {
  return [
    row([line()]),
    row([headline("Einverständniserklärung", 2)]),
    row([paragraph("<p>ABZ Zahnärztliches Rechenzentrum für Bayern · Abrechnung über Factoring</p>")]),
    row([paragraph(CONSENT_LEFT), paragraph(CONSENT_RIGHT)]),
    row([
      paragraph(RELATIVE_INTRO),
      inputText("Name, Vorname des gesetzl. Vertreters* / abweichenden Rechnungsempfängers", false),
    ]),
    row([
      paragraph(RELATIVE_NOTES),
      radio("Stellung zur Patientin / zum Patienten", [
        { label: "Elternteil**" },
        { label: "Betreuer/-in" },
        { label: "Ehegattin / Ehegatte" },
        {
          label: "oder",
          fields: [inputText("Bitte Stellung kurz angeben", false)],
        },
      ], false),
    ]),
    row([signature("Ort / Datum und Unterschrift Patient/-in bzw. gesetzl. Vertreter/-in* und ggf. abweichende/-r Rechnungsempfänger/-in")]),
    row([line()]),
    row([headline("Informationen zu Ihrer Rechnung und zum Datenschutz", 1)]),
    row([paragraph(INFO_LEFT), paragraph(INFO_RIGHT)]),
    row([paragraph(INFO_CONTACT)]),
  ];
}

function looksLikeThaler(name) {
  const n = String(name || "").toLowerCase();
  return n.includes("thaler") || n.includes("mainburg") && n.includes("zahn");
}

async function findThaler() {
  const snap = await db.collection("clients").select("name").get();
  const hits = [];
  for (const doc of snap.docs) {
    const name = doc.get("name") || "";
    if (looksLikeThaler(name)) hits.push({ id: doc.id, name });
  }
  return hits;
}

async function main() {
  const hits = await findThaler();
  console.log("Treffer clients.name:");
  for (const h of hits) console.log(`  ${h.id}  ${h.name}`);
  if (hits.length !== 1) {
    throw new Error(hits.length === 0
      ? "Kein Thaler-Mandant gefunden."
      : "Mehrere Treffer — Abbruch, nichts geschrieben.");
  }

  const clientId = hits[0].id;
  const locSnap = await db.collection("clients").doc(clientId).collection("locations").get();
  const locations = locSnap.docs.map((d) => ({ id: d.id, name: d.get("name") || "" }));
  console.log("Standorte:");
  for (const loc of locations) console.log(`  ${loc.id}  ${loc.name}`);
  if (locations.length !== 1) {
    throw new Error(locations.length === 0
      ? "Kein Standort."
      : "Mehrere Standorte — Abbruch, nichts geschrieben.");
  }

  const locationId = locations[0].id;
  const docsRef = db.collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("pdocuments");
  const docsSnap = await docsRef.get();
  const existing = docsSnap.docs.map((d) => ({
    id: d.id,
    name: d.get("name") || "",
    cardinality: d.get("cardinality") || 0,
  }));
  console.log(`Vorlagen (${existing.length}):`);
  for (const d of existing) console.log(`  ${d.id}  ${d.name}`);

  const same = existing.find((d) => d.name === DOC_NAME || d.id === DOC_ID);
  if (same) {
    console.log(`Vorlage existiert schon: ${same.id} — kein Write.`);
    return;
  }

  if (!WRITE) {
    console.log(`Dry-run. Neue ID wäre ${DOC_ID}. Zum Anlegen: node scripts/_thaler_signr_abz_ee.mjs --write`);
    return;
  }

  const maxCard = existing.reduce((m, d) => Math.max(m, Number(d.cardinality) || 0), 0);
  const payload = {
    id: DOC_ID,
    templateId: "",
    patId: "",
    aptId: "",
    docId: "",
    name: DOC_NAME,
    lang: [{ key: "de", name: DOC_NAME }],
    expiresAfter: "0-m",
    expiresAt: null,
    mandatory: false,
    createdAt: null,
    pdfCreatedAt: null,
    status: "none",
    fileSrc: "",
    sortIndex: maxCard,
    cardinality: maxCard + 1,
    formRows: buildFormRows(),
  };

  const createdRef = docsRef.doc(DOC_ID);
  const already = await createdRef.get();
  if (already.exists) {
    throw new Error(`Dokument ${DOC_ID} existiert — Abbruch, nichts überschrieben.`);
  }
  await createdRef.create(payload);
  console.log(`ANGELEGT ${DOC_ID} unter clients/${clientId}/locations/${locationId}/pdocuments`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
