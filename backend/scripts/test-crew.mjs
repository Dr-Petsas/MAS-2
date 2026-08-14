import { crewWho } from "../public/m/crew.js";

let fehler = 0;
function check(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(got)} statt ${JSON.stringify(want)}`}`);
  if (!ok) fehler += 1;
}

check("Anrufprotokoll ist Bianca", crewWho({ tool: "call_log" }), "Bianca");
check("Bindestrich-Tool", crewWho({ tool: "call-log" }), "Bianca");
check("Post ist Nadine", crewWho({ tool: "ask_nadine" }), "Nadine");
check("SMS ist Lisa", crewWho({ tool: "send_sms" }), "Lisa");
check("Lisa-Karte", crewWho({ card: { kind: "lisa_live" } }), "Lisa");
check("Doku-Karte ist Lena", crewWho({ card: { kind: "doku" } }), "Lena");
check("Sophie-Karte", crewWho({ card: { kind: "sophie" } }), "Sophie");
check("Kalender bleibt dunkel", crewWho({ tool: "day_briefing" }), "");
check("Patientensuche bleibt dunkel", crewWho({ tool: "search_patient" }), "");
check("Nur Anrufe auf Eingänge → Bianca", crewWho({ card: { kind: "eingaenge", subtitle: "2 Anrufe" } }), "Bianca");
check("Mail auf Eingänge → Nadine", crewWho({ card: { kind: "eingaenge", subtitle: "1 E-Mail" } }), "Nadine");
check("Diktat SMS → Lisa", crewWho({ tool: "dictate", channel: "sms" }), "Lisa");
check("Diktat Mail → Nadine", crewWho({ tool: "dictate", channel: "email" }), "Nadine");
check("explizites who gewinnt", crewWho({ who: "Julia", tool: "send_sms" }), "Julia");
check("unbekanntes who ignorieren", crewWho({ who: "Clara" }), "");

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : "\nAlle Prüfungen bestanden.");
process.exitCode = fehler ? 1 : 0;
