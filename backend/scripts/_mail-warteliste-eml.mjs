import fs from "fs";

const html = fs.readFileSync("F:/Bianca&Lisa TelefonKI/docs/mails/warteliste-auftrag-kiriakos-2026-09-25.html");
const text = fs.readFileSync("F:/Bianca&Lisa TelefonKI/docs/mails/warteliste-auftrag-kiriakos-2026-09-25.md");
const b = "===============WAITLIST20260925==";
const out = "F:/Bianca&Lisa TelefonKI/docs/mails/warteliste-auftrag-kiriakos-2026-09-25.eml";
const head = [
  "From: Pickadoc <Nadine@pickadoc.de>",
  "To: development@pickadoc.de",
  "Cc: dr.petsas@pickadoc.de",
  "Reply-To: dr.petsas@pickadoc.de",
  "Subject: Blessing: Warteliste fuer ferne Termine - Auftrag, nur E-Mail, Bianca noch nicht",
  "MIME-Version: 1.0",
  `Content-Type: multipart/alternative; boundary="${b}"`,
  "",
  "",
].join("\r\n");
const plain = `--${b}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n`;
const htmlPart = `\r\n--${b}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n`;
const end = `\r\n--${b}--\r\n`;
fs.writeFileSync(out, Buffer.concat([
  Buffer.from(head + plain),
  text,
  Buffer.from(htmlPart),
  html,
  Buffer.from(end),
]));
console.log("eml", fs.statSync(out).size);
