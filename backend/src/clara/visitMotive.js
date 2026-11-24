// Terminart aus einem gesprochenen Namen bestimmen.
//
// 24.11.2026: "naechster freier Termin fuer eine Kontrolle" ergab "alles belegt", obwohl zwanzig
// Zeiten frei waren. Die Terminart heisst "KCH Kontrolluntersuchung"; "Kontrolle" steckt weder
// darin noch umgekehrt, also ging der unbekannte Name an die Plattform und die fand nichts.
// Dritte Stufe: ein Wort der Anfrage und ein Wort der Terminart beginnen gleich
// ("kontrolle" / "kontrolluntersuchung"), mindestens fuenf Buchstaben und gut die Haelfte des
// kuerzeren Worts. Greift nur, wenn genau eine Terminart so passt.

const norm = (s) => String(s ?? "").trim();
const woerter = (s) => norm(s).toLowerCase().replaceAll(",", " ").replaceAll("-", " ").replaceAll(".", " ")
  .split(" ").filter((w) => w.length >= 5);

function gleicherAnfang(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n >= 5 && n >= 0.55 * Math.min(a.length, b.length);
}

export function resolveVisitMotive(booking, visitMotiveName) {
  const vms = Array.isArray(booking?.visitMotives) ? booking.visitMotives : [];
  const q = norm(visitMotiveName).toLowerCase();
  if (!q) return null;
  const exact = vms.find((v) => norm(v.name).toLowerCase() === q);
  if (exact) return exact;
  const teil = vms.find((v) => norm(v.name).toLowerCase().includes(q) || q.includes(norm(v.name).toLowerCase()));
  if (teil) return teil;
  const gefragt = woerter(q);
  const nah = vms.filter((v) => woerter(v.name).some((w) => gefragt.some((g) => gleicherAnfang(g, w))));
  return nah.length === 1 ? nah[0] : null;
}
