// Weltfrage in der KI-Zeile: dieselbe Recherche wie am Telefon.
// Hier dürfen die Links im Text stehen. Eine Brief-Aufgabe oder eine
// hochgeladene Unterlage geht weiter an Nadine.
import { spawn } from "node:child_process";
import path from "node:path";

const WELT_RE = new RegExp(
  [
    "fusobakter", "fusobacter", "nukleatum", "nucleatum", "mikrobiom",
    "olympia", "hochsprung", "bundesliga", "fussball", "fußball",
    "\\bdated\\b", "\\bdating\\b", "aniston", "jenifer", "jennifer",
    "\\bnachrichten\\b", "\\bkrieg\\b", "\\btrump\\b", "\\bnews\\b",
    "\\bgoz\\b", "\\bbema\\b", "\\bgoae\\b", "\\bgoä\\b",
    "pubmed", "\\bleitlinie\\b", "\\bawmf\\b", "fachinfo",
    "\\bmusik\\b", "\\bkino\\b", "\\bmode\\b", "\\bfilm\\b",
    "schauspieler", "regisseur", "\\bsport\\b",
  ].join("|"),
  "i",
);

const BRIEF_RE = /\b(mail|e-mail|brief|betreff|formulie|hoeflich|höflich|anrede|grußformel|grussformel)\b/i;

export function istWeltfrage(text) {
  const roh = String(text || "").trim();
  if (!roh || BRIEF_RE.test(roh)) return false;
  return WELT_RE.test(roh);
}

export function hatEchteUnterlage(documents) {
  return (Array.isArray(documents) ? documents : []).some((doc) => {
    const name = String(doc?.filename || "");
    const text = String(doc?.text || "").trim();
    if (!text || name.startsWith("MAS-Verlauf")) return false;
    return true;
  });
}

function letzterSatz(messages) {
  const liste = Array.isArray(messages) ? messages : [];
  for (let i = liste.length - 1; i >= 0; i -= 1) {
    const eintrag = liste[i];
    if (eintrag && eintrag.role === "user" && String(eintrag.content || "").trim()) {
      return String(eintrag.content).trim();
    }
  }
  return "";
}

function recherchieren(frage) {
  const wurzel = process.env.CLARA_VOICE_ROOT || "F:\\Clara-Voice";
  const python = process.env.WELT_PYTHON || "python";
  const skript = path.join(wurzel, "tools", "welt_zeile.py");
  return new Promise((resolve) => {
    let kind;
    try {
      kind = spawn(python, [skript], {
        cwd: wurzel,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
    } catch (err) {
      console.warn(`[welt-zeile] start: ${err?.message || err}`);
      resolve("");
      return;
    }
    const stuecke = [];
    const fehler = [];
    const timer = setTimeout(() => {
      kind.kill();
      resolve("");
    }, 60000);
    kind.stdout.on("data", (buf) => stuecke.push(buf));
    kind.stderr.on("data", (buf) => fehler.push(buf));
    kind.on("error", (err) => {
      clearTimeout(timer);
      console.warn(`[welt-zeile] ${err?.message || err}`);
      resolve("");
    });
    kind.on("close", () => {
      clearTimeout(timer);
      const roh = Buffer.concat(stuecke).toString("utf8").trim();
      try {
        const data = JSON.parse(roh);
        resolve(String(data?.text || "").trim());
      } catch {
        if (fehler.length) console.warn(`[welt-zeile] ${Buffer.concat(fehler).toString("utf8").slice(0, 400)}`);
        resolve("");
      }
    });
    kind.stdin.end(Buffer.from(frage, "utf8"));
  });
}

export async function weltAntwortText({ messages, documents, activeDocument } = {}) {
  if (String(activeDocument || "").trim()) return "";
  if (hatEchteUnterlage(documents)) return "";
  const frage = letzterSatz(messages);
  if (!istWeltfrage(frage)) return "";
  return recherchieren(frage);
}
