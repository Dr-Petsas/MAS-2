// Testdrop + AppConnect-Versuch fuer Mustermann (Pat 2). Schreibt nie in die Bank.
import fs from "node:fs";
import net from "node:net";
import { writeNoteDrop, writePdfDrop, DENS_EXCHANGE_DIR } from "../src/pvs/densDrop.js";

const HOST = "192.168.0.173";
const PORT = 212;
const CLIENT_ID = "pickadoc";

function miniPdf(title) {
  const body = `BT /F1 12 Tf 72 720 Td (${title.replace(/[()\\]/g, " ")}) Tj ET`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n` +
    `2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n` +
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources<< /Font<< /F1<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>endobj\n` +
    `4 0 obj<< /Length ${body.length} >>stream\n${body}\nendstream\nendobj\n` +
    `trailer<< /Root 1 0 R >>\n%%EOF\n`,
  );
}

function b64json(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

function decodePayload(pl) {
  if (typeof pl !== "string" || !pl) return pl;
  try { return JSON.parse(Buffer.from(pl, "base64").toString("utf8")); } catch { return pl; }
}

function send(command, payload) {
  return new Promise((resolve, reject) => {
    const requestId = `pd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const sock = net.createConnection({ host: HOST, port: PORT }, () => {
      sock.write(JSON.stringify({ requestId, command, payload: b64json(payload) }) + "\n");
    });
    sock.setTimeout(4000);
    let buf = "";
    sock.on("data", (d) => { buf += d.toString("utf8"); if (buf.includes("\n")) sock.end(); });
    sock.on("timeout", () => { sock.destroy(); reject(new Error("timeout")); });
    sock.on("error", reject);
    sock.on("close", () => {
      try {
        const msg = JSON.parse(buf.trim().split("\n")[0]);
        resolve({ requestId, command, status: msg.status, payload: decodePayload(msg.payload) });
      } catch (err) {
        reject(new Error(`bad reply: ${buf.slice(0, 200)} (${err.message})`));
      }
    });
  });
}

const text = [
  "KI-DOKUMENTATION PICKADOC",
  "",
  "Anlass: Implantation OP klein · 60 min",
  "Anamnese: Vorerkrankung: Chronisch Hepatitis b · Medikamente: Viread 245 · Vorerkrankung: Hepatitis · Allergie: Penicillin",
  "Dokumente:",
  "- Anamnesebogen",
  "- CareCapital",
  "- Datenschutz Einwilligung",
  "- KI-Telefonie: Patientenaufklärung",
].join("\n");

const note = writeNoteDrop({
  text,
  patNr: "2",
  lastName: "Mustermann",
  firstName: "Helmut",
}, DENS_EXCHANGE_DIR);

const docs = [
  "Anamnesebogen",
  "CareCapital",
  "Datenschutz Einwilligung",
  "KI-Telefonie Patientenaufklaerung",
];
const pdfs = writePdfDrop({
  patNr: "2",
  lastName: "Mustermann",
  firstName: "Helmut",
  files: docs.map((name) => ({ name, buffer: miniPdf(`Pickadoc ${name}`) })),
}, DENS_EXCHANGE_DIR);

console.log("drop", { note: note.txt, pdfs: pdfs.files.map((f) => f.pdf) });

const version = await send("GET_VERSION", {});
console.log("GET_VERSION", version.status, version.payload);

const hello = await send("HELLO", { clientId: CLIENT_ID });
console.log("HELLO", hello.status, hello.payload);

if (hello.status === 410) {
  const first = await send("FIRST_CONTACT", { clientId: CLIENT_ID, clientName: "Pickadoc" });
  console.log("FIRST_CONTACT", first.status, first.payload);
}

const noteTry = await send("SEND_PATIENT_NOTE", {
  clientId: CLIENT_ID,
  patNr: "2",
  PatNr: "2",
  PatientNummer: "2",
  KurzBezeichnung: "Pickadoc Doku",
  Kurzbezeichnung: "Pickadoc Doku",
  Text: text,
  Notiz: text,
  Notiztext: text,
});
console.log("SEND_PATIENT_NOTE", noteTry.status, noteTry.payload);

const firstPdf = fs.readFileSync(pdfs.files[0].pdf);
const dokTry = await send("SEND_TO_EXTDOK", {
  clientId: CLIENT_ID,
  patNr: "2",
  PatNr: "2",
  PatientNummer: "2",
  FileName: "2-Anamnesebogen.pdf",
  FileSize: firstPdf.length,
  FileContent: firstPdf.toString("base64"),
  KurzBezeichnung: "Anamnesebogen",
  Anmerkung: "Pickadoc",
});
console.log("SEND_TO_EXTDOK", dokTry.status, dokTry.payload);
