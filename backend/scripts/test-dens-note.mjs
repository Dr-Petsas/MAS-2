import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  KURZ_MAX,
  KURZ_DEFAULT,
  kurzBezeichnung,
  sanitizePatNr,
  toNotizXml,
  toExtDokXml,
  buildNote,
} from "../src/pvs/densNote.js";
import { isBlockedDir, resolveDropDir, writeNoteDrop, writePdfDrop } from "../src/pvs/densDrop.js";

function testKurz() {
  assert.equal(kurzBezeichnung({}), KURZ_DEFAULT);
  const long = kurzBezeichnung({ lastName: "Möllenberg-Westphalen", firstName: "Hans-Peter" });
  assert.ok(long.length <= KURZ_MAX);
  assert.ok(long.startsWith("Pickadoc"));
}

function testPatNr() {
  assert.equal(sanitizePatNr(" 12 345 "), "12345");
  assert.equal(sanitizePatNr("../Bank/x"), "Bankx");
}

function testXmlEscape() {
  const xml = toNotizXml({
    patNr: "7",
    kurz: 'Doku "A"<B>',
    text: "Zeile 1\nKaries & Füllung ]]>",
  });
  assert.match(xml, /PatientNummer="7"/);
  assert.match(xml, /KurzBezeichnung="Doku &quot;A&quot;&lt;B&gt;"/);
  assert.match(xml, /<!\[CDATA\[Zeile 1\nKaries & Füllung ]]]]><!\[CDATA\[>\]\]>/);
}

function testBuildNote() {
  const note = buildNote({
    text: "KI-DOKUMENTATION PICKADOC\nFüllung 36",
    patNr: "1042",
    lastName: "Meier",
    firstName: "Anna",
    createdAt: "2026-08-16T10:00:00.000Z",
  });
  assert.equal(note.patNr, "1042");
  assert.equal(note.kurz, "Pickadoc Doku Meier Anna");
  assert.ok(note.stem.startsWith("1042-pickadoc-doku-"));
  assert.match(note.xml, /PatientNummer="1042"/);
}

function testDropAndBankGuard() {
  assert.equal(isBlockedDir("C:\\Dens\\DensOffice\\Bank"), true);
  assert.equal(isBlockedDir("C:\\Dens\\DensOffice\\Bank\\Dok"), true);
  assert.equal(isBlockedDir("C:\\Dens\\DensOffice\\Module"), false);
  assert.throws(() => resolveDropDir("C:\\Dens\\DensOffice\\Bank\\Dok"), { code: "dens_drop_blocked" });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dens-drop-"));
  try {
    const drop = writeNoteDrop({
      text: "Befund: 36 karies",
      patNr: "88",
      lastName: "Test",
      createdAt: "2026-08-16T12:00:00.000Z",
    }, dir);
    assert.equal(fs.existsSync(drop.txt), true);
    assert.equal(fs.existsSync(drop.xml), true);
    assert.equal(fs.readFileSync(drop.txt, "utf8").trim(), "Befund: 36 karies");
    assert.match(fs.readFileSync(drop.xml, "utf8"), /PatientNummer="88"/);
    assert.ok(!drop.dir.toLowerCase().includes("\\bank"));

    const xml = toExtDokXml({
      patNr: "88",
      kurz: "Anamnesebogen",
      dateiname: "C:\\tmp\\88-Anamnesebogen.pdf",
    });
    assert.match(xml, /PatientExtDok PatientNummer="88"/);
    assert.match(xml, /KurzBezeichnung="Anamnesebogen"/);
    assert.match(xml, /Dateiname="C:\\tmp\\88-Anamnesebogen.pdf"/);

    const pdfs = writePdfDrop({
      patNr: "88",
      lastName: "Test",
      files: [{ name: "Anamnesebogen", buffer: Buffer.from("%PDF-1.4 test") }],
    }, dir);
    assert.equal(pdfs.files.length, 1);
    assert.equal(fs.existsSync(pdfs.files[0].pdf), true);
    assert.equal(fs.existsSync(pdfs.files[0].xml), true);
    assert.match(fs.readFileSync(pdfs.files[0].xml, "utf8"), /PatientExtDok/);
    assert.ok(pdfs.files[0].pdf.endsWith("88-Anamnesebogen.pdf"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

testKurz();
testPatNr();
testXmlEscape();
testBuildNote();
testDropAndBankGuard();
console.log("test-dens-note: ok");
