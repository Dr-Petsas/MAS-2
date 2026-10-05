// Syntaxpruefung der Inline-Skripte in ipad-app.html / lena-01/start.html.
// Nur Parsen (vm.Script kompiliert ohne auszufuehren) — DOM-Zugriffe stoeren
// dabei nicht. Faengt Tippfehler ab, bevor die Seite aufs iPad geht.
import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";

const run = promisify(execFile);

/** ES-Module koennen nicht mit vm.Script geparst werden (top-level import).
    Darum als .mjs ablegen und von node selbst pruefen lassen. */
async function pruefeModul(code, label) {
  const datei = path.join(tmpdir(), `ipadcheck_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(datei, code, "utf8");
  try {
    await run(process.execPath, ["--check", datei]);
    return "";
  } catch (e) {
    return String(e.stderr || e.message).split("\n").slice(0, 3).join(" ").trim();
  } finally {
    await unlink(datei).catch(() => {});
  }
}

const dateien = [
  "public/m/ipad-app.html",
  "public/m/lena-01/start.html",
];

let fehler = 0;
for (const datei of dateien) {
  const html = await readFile(datei, "utf8");
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    const code = m[2] || "";
    i += 1;
    if (/\bsrc=/i.test(attrs) || !code.trim()) continue;
    const zeile = html.slice(0, m.index).split("\n").length;
    const modul = /type\s*=\s*["']module["']/i.test(attrs);
    let meldung = "";
    if (modul) {
      meldung = await pruefeModul(code, `${datei}:${zeile}`);
    } else {
      try {
        new vm.Script(code, { filename: `${datei}:${zeile}` });
      } catch (e) {
        meldung = e.message;
      }
    }
    if (meldung) {
      fehler += 1;
      console.log(`  FEHLER ${datei} Block ${i} (ab Zeile ${zeile}): ${meldung}`);
    } else {
      console.log(`  ok    ${datei} Block ${i} (ab Zeile ${zeile})${modul ? " [module]" : ""}`);
    }
  }
}
console.log(fehler ? `\n${fehler} Syntaxfehler` : "\nAlle Inline-Skripte parsen sauber.");
process.exit(fehler ? 1 : 0);
