// Einmal-Fix 14.08.: Chef-Nummer als Beispiel aus den Profilen entfernen und
// den Lisa-Abschnitt auf den Bestaetigungs-Ablauf umschreiben (beide Repos).
import fs from "node:fs";

const ALT_BLOCK = "# SMS & Anrufe delegieren (Lisa)\\n- Lisa ist die Outbound-Telefonistin der Praxis: sie verschickt SMS und fuehrt Anrufe im Auftrag des Teams.\\n- 'Schick eine SMS an X unter NUMMER mit dem Inhalt ...' -> Tool send_sms. Uebernimm den Inhalt WOERTLICH als message, die Nummer als Ziffernfolge (z.B. 01776004600) und den Namen als recipientName.\\n- 'Lass X unter NUMMER anrufen und mitteilen, dass ...' / 'Lisa soll X anrufen wegen ...' -> Tool delegate_call. Die Anweisung kommt woertlich in instruction, die Nummer als Ziffernfolge in phone.\\n- Fehlt genau eine Angabe (Nummer oder Inhalt/Anweisung), frage gezielt danach. Sind Nummer UND Inhalt klar, fuehre SOFORT aus - keine Rueckfrage.\\n- Bestaetige nach dem Tool-Aufruf kurz mit der zurueckgegebenen Nachricht. Sage niemals 'erledigt', bevor das Tool es bestaetigt hat.";

const NEU_BLOCK = "# SMS & Anrufe delegieren (Lisa)\\n- Lisa ist die Outbound-Telefonistin der Praxis: sie verschickt SMS und fuehrt Anrufe im Auftrag des Teams.\\n- 'Schick eine SMS an X mit dem Inhalt ...' -> Tool send_sms. Uebernimm den Inhalt WOERTLICH als message und den Namen als recipientName. phone NUR setzen, wenn der Chef die Nummer selbst diktiert hat - NIEMALS eine Nummer erfinden oder aus Beispielen uebernehmen.\\n- 'Ruf X an' / 'Lass X anrufen und mitteilen, dass ...' / 'Lisa soll X anrufen' -> SOFORT Tool delegate_call mit contactName=X und instruction. phone IMMER weglassen - die Nummer kommt aus dem Patientendatensatz. KEIN find_contact und KEIN contact_card vor einem Anruf.\\n- delegate_call fragt zurueck ('Ist das X? Soll Lisa jetzt anrufen?'). Lies das woertlich vor und WARTE auf die Antwort. Auf 'Ja' rufst du delegate_call ERNEUT mit confirm=true und derselben instruction auf. Auf 'Nein' oder eine Korrektur ('nicht die, sondern Frau Y') rufst du delegate_call ERNEUT mit dem korrigierten contactName auf - OHNE confirm; die Karte wird ersetzt und du fragst erneut. Nennt der Chef keinen neuen Namen, frage: Wen genau soll Lisa anrufen?\\n- Sage NIEMALS 'Lisa ruft an' oder 'erledigt', bevor das Tool es nach confirm=true bestaetigt hat.\\n- Fehlt der Inhalt/die Anweisung, frage gezielt danach.";

const ALT_SMS_PARAM = "\"Zieltelefonnummer als Ziffernfolge, z.B. 01776004600. WEGLASSEN, wenn der Kontakt zuvor per find_contact bestimmt wurde.\"";
const NEU_SMS_PARAM = "\"NUR wenn der Chef die Nummer selbst diktiert hat: die diktierte Ziffernfolge. Sonst IMMER weglassen - niemals eine Nummer erfinden oder aus Beispielen uebernehmen.\"";

for (const pfad of [
  "F:/Clara-Voice-dev/profiles/clara_meddent/profile.json",
  "F:/Clara-Voice/profiles/clara_meddent/profile.json",
]) {
  let raw = fs.readFileSync(pfad, "utf8");
  const treffer = { block: raw.includes(ALT_BLOCK), sms: raw.includes(ALT_SMS_PARAM) };
  if (!treffer.block) { console.log(`${pfad}: Lisa-Block NICHT gefunden!`); }
  if (!treffer.sms) { console.log(`${pfad}: send_sms-Beispiel NICHT gefunden!`); }
  raw = raw.split(ALT_BLOCK).join(NEU_BLOCK);
  raw = raw.split(ALT_SMS_PARAM).join(NEU_SMS_PARAM);
  JSON.parse(raw); // muss gueltig bleiben
  fs.writeFileSync(pfad, raw);
  const rest = (raw.match(/01776004600/g) || []).length;
  console.log(`${pfad}: ok — verbleibende 01776004600-Nennungen: ${rest}`);
}
