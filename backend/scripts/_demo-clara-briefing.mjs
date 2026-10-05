import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const masEnv = path.join(here, "..", ".env");
const audioDir = "F:/pickadoc-live-base/demo-erleben/assets/clara";
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const CLIPS = [
  {
    file: "briefing.mp3",
    text:
      "Schön, dass Sie da sind. Ich bin Clara. Das hier ist Ihr Kalender — eine kleine Bühne, kein leeres Raster. Paul Hartmann kommt heute um halb zwölf zur Kontrolle, Maria Vogel um drei zur PZR. Bleiben Sie einen Moment am Kalender: sobald jemand bucht, anruft oder eine E-Mail schickt, sage ich es Ihnen in einem Satz.",
  },
  { file: "k-calendR.mp3", text: "Das ist Calendar — Ihr Wochenkalender, Montag bis Freitag, genau wie in Pickadoc." },
  { file: "k-livebot.mp3", text: "Rechts läuft der Livebot. Dort steht, was gerade im Haus passiert — Buchung, SMS, Anruf." },
  { file: "k-signR.mp3", text: "Sainer ist die Dokumentenmappe. Patienten füllen Anamnese und Aufklärung aus und unterschreiben, bevor sie in der Praxis sitzen." },
  { file: "k-clonR.mp3", text: "Klohner ist kein Begrüßungsvideo. Mit Klohner wird der normale Termin zum medialen Erlebnis. Ihre Patienten erhalten mit der Terminbestätigung ein Kie-Video — Sie stehen im Rampenlicht und erklären den anstehenden Termin. Dieselben Videos nutzen Sie für Marketing oder Patientenaufklärung, ganz wie Sie es bevorzugen. Jedes Video hat eine Share-Funktion und bringt Ihnen kostenlose Handy-zu-Handy-Propaganda. Filmen müssen Sie nicht: ein Foto und zehn Sekunden Stimme reichen. Danach entstehen neue Videos per Texteingabe — in über vierzig Sprachen, damit Sie Patienten in ihrer Muttersprache ansprechen." },
  { file: "k-patient.mp3", text: "Die Patientensicht: die Bestätigungs-SMS mit dem Link, und dahinter die Landingpage — Überschrift, Video, Beschreibung." },
  { file: "k-clara.mp3", text: "In der Pickadoc-Vollversion sitze ich als Souffleuse auf Ihrem Headset. Es gibt sehr unaufdringliche, kaum sichtbare Headsets mit Knochenleitung — ohne Knopf im Ohr. Der Ton geht über den Knochen, das Ohr bleibt frei, und unter den Haaren sieht man sie kaum. Zwischen zwei Patienten briefe ich Sie in zehn Sekunden vollständig über den nächsten Patienten. Oder ich fülle Ihren Terminkalender, wenn Lücken entstehen. Telefonate, Briefe, Mails, sogar Qualitätsmanagement und Arbeitszeiterfassung habe ich im Blick. Und ich bin immer freundlich und nie krank." },
  { file: "k-bianca.mp3", text: "Bianca nimmt eingehende Patientenanrufe an und schreibt jedes Gespräch ins Protokoll. Sie können die Aufzeichnung hören." },
  { file: "k-lisa.mp3", text: "Lisa ist Ihre Kollegin. Sie ruft Ihre Patienten an, wenn etwas Wichtiges anliegt, organisiert den Recall und bestellt Patienten um, wenn es sein muss. Mit Ihrem Auftrag kann sie auch im Kindergarten oder beim Bäcker anrufen. Sie hören das Gespräch und sehen den Verlauf." },
  { file: "k-nadine.mp3", text: "Nadine ist der Posteingang. Hauspost kommt als Scan, Mails liegen da, und sie schreibt Antworten als Entwurf." },
  { file: "k-lena.mp3", text: "Lena schreibt die Behandlung mit. Sie diktieren, sie strukturiert. Am iPad gehört der Befund dazu." },
  { file: "tour-01.mp3", text: "Ich bin Clara, Ihre interne Sprach-Assistentin. Scrollen Sie sich durch die Kapitel — ich fange mit dem an, was Ihnen im Alltag am meisten Zeit spart, und arbeite mich dann durch den Rest." },
  { file: "tour-02.mp3", text: "Bevor der nächste Patient ins Zimmer kommt, fasse ich Ihnen in wenigen Sekunden zusammen, was Sie über ihn wissen müssen: was beim letzten Mal gemacht wurde, was in seinem Anamnesebogen auffällt, welche Unterlagen fehlen und was zwischenzeitlich telefonisch oder per Mail hereinkam. Sie können auch einen einzelnen Namen oder eine Uhrzeit nennen. Standardmäßig nehme ich die nächsten zwei Patienten." },
  { file: "tour-03.mp3", text: "Eine Lücke im Kalender ist verlorener Umsatz. Ich zeige Ihnen die Lücken der nächsten Tage und dazu Patienten aus dem Recall-Topf, die passen. Angerufen wird niemand, bevor Sie freigeben — dann übernimmt Lisa, ruft an oder schickt eine SMS mit Zusage-Link, und die erste Zusage bucht den Platz. Wen Lisa gerade erreicht hat, sage ich Ihnen jederzeit." },
  { file: "tour-04.mp3", text: "Ihre Hauspost geht zum Scan-Dienstleister und kommt als E-Mail bei Nadine an — kein Papier, keine Ablage, keine Postmappe. Nadine sortiert alles ein: Rechnung, Labor, Kammer, Beschwerde, Anwaltsschreiben. Was beantwortet werden muss, liegt schon als Entwurf da, mit dem passenden Zusammenhang aus Vorgang, Telefonaten und früheren Briefen. Ich lese Ihnen den Eingang vor, Sie sagen ja — dann geht es raus." },
  { file: "tour-05.mp3", text: "Sprechen Sie in ganzen Sätzen mit mir, nicht in Stichworten. Sagen Sie lieber: Sag den Termin von Herrn Meier am Dienstag ab. Je mehr Zusammenhang in einem Satz steckt — Name, Tag und Absicht zusammen —, desto sicherer treffe ich das Richtige." },
  { file: "tour-06.mp3", text: "Morgens sage ich Ihnen, was ansteht und was über Nacht hereinkam, abends nur noch das, was für morgen wirklich wichtig ist. Zwischendurch frage ich Sie ab: wie voll der Tag ist, wo Luft ist, wer heute kommt. Und wenn es brennt — Anwalt, Kammer, Mahnung, Frist —, steht das oben. Feiertage und Wochenenden erkenne ich; einen Feiertag behandle ich nie als Arbeitstag." },
  { file: "tour-07.mp3", text: "Bei Terminen suche ich erst den richtigen Patienten und handle dann. Ich buche, sage ab, verschiebe, nenne den nächsten freien Termin und sage Ihnen, wann jemand zuletzt da war oder das nächste Mal kommt. Bei mehreren gleich klingenden Namen frage ich nach, statt zu raten — und abgesagt wird nur, wenn Sie es bestätigen." },
  { file: "tour-08.mp3", text: "Alles, was in der Praxis passiert, sammle ich pro Patient: Anrufe, SMS, Mails, Briefe, Notizen und offene Vorgänge. Fragen Sie mich, was mit Herrn Meier war, und ich lese seine Spur vor. Sagen Sie: Merk dir, Herr Fischer braucht eine neue Schiene — und die Notiz kommt zu seinem nächsten Termin von allein wieder hoch. Bianca, Lisa und Nadine schreiben in dasselbe Gedächtnis, deshalb weiß ich auch, was am Telefon besprochen wurde, als Sie behandelt haben." },
  { file: "tour-09.mp3", text: "Bianca nimmt die Patientenanrufe an, auch wenn bei Ihnen niemand am Tresen steht, und schreibt jedes Gespräch ins Gedächtnis. Ich sage Ihnen danach, wer angerufen hat und worum es ging. In die andere Richtung schicke ich Lisa los: sie ruft an und richtet aus, was Sie gesagt haben, verschickt SMS im Wortlaut und meldet zurück, was dabei herauskam." },
  { file: "tour-10.mp3", text: "Anwaltsschreiben, Kammer, Mahnung, Pfändung: solche Sachen dürfen nicht in einem Stapel liegen bleiben. Ich ziehe Fristen und offene Rechnungen aus Mails, gescannter Post und Telefonaten zusammen und sage Ihnen, was überfällig ist, was heute fällig wird und was bald ansteht. Beträge stehen dabei auf der Karte am Handy, ich spreche sie nicht aus." },
  { file: "tour-11.mp3", text: "Sie sprechen, Lena schreibt: Behandlungen diktieren Sie einfach, den Befund nehmen wir am iPad im Zahnschema auf, und einen Nachtrag zu einem vergangenen Termin können Sie jederzeit hinterherschieben. Sophie schlägt Ihnen dazu die passenden Ziffern vor. Wenn irgendwo Doku fehlt, sage ich es Ihnen — und wenn eine Rückfrage nervt, stellen wir die Regel dauerhaft ab." },
  { file: "tour-12.mp3", text: "Julia hält das Qualitätsmanagement zusammen: Prüfungen, Hygiene- und Steri-Pläne, Gerätebücher. Fragen Sie mich, was fällig ist — ich sage Ihnen, was überfällig ist, was diese Woche dran ist und wer es zuletzt gemacht hat. Die Aufgaben selbst landen als Push bei der zuständigen Mitarbeiterin, die sie am Handy abhakt." },
  { file: "tour-13.mp3", text: "Wenn Sie nicht da sind, zeige ich Ihnen zuerst, welche Termine betroffen wären — abgesagt wird nichts, bevor Sie freigeben. Danach sperre ich den Tag, storniere die Termine und jeder Patient bekommt genau eine Absage mit Buchungslink. Zum Team kann ich Ihnen sagen, wer da ist, wer krank oder im Urlaub ist und wie viel Resturlaub jemand hat. Betriebsferien trage ich ein und informiere alle per Push — nach Ihrer Bestätigung." },
  { file: "tour-14.mp3", text: "Was Ihnen zwischen zwei Patienten einfällt, muss nicht auf einen Zettel: Sagen Sie es mir, und es wird eine Aufgabe oder ein Vorgang. Ich notiere, wer sich darum kümmert, halte den Fortschritt fest und schließe den Vorgang, wenn er durch ist. Was offen ist, sage ich Ihnen im Morgen-Auftakt." },
  { file: "tour-15.mp3", text: "Über mich erreichen Sie das ganze Team: Nadine für Post, Briefe und E-Mails, Bianca am Patiententelefon, Lisa für Recall, Umbestellungen und Anrufe im Auftrag, Julia für das Qualitätsmanagement, Lena für die Dokumentation, Sophie für die Abrechnung und Marie für Arbeitszeit und Urlaub. Sie sagen einfach, wer was tun soll." },
  { file: "tour-16.mp3", text: "Ich rede, wie man in der Praxis redet: aus einem Datum wird morgen oder nächste Woche Montag, aus einer Uhrzeit neun Uhr zehn, aus einer Abkürzung ein ganzes Wort. Telefonnummern lasse ich Ziffer für Ziffer, damit Sie sie mitschreiben können. Ich stelle immer nur eine Frage auf einmal, und ich verstehe Deutsch und Griechisch." },
];

function loadEnv(p, into) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (into[k] == null || into[k] === "") into[k] = v;
  }
}

async function synth(key, clip) {
  const out = path.join(audioDir, clip.file);
  if (fs.existsSync(out) && fs.statSync(out).size > 800) {
    console.log("exists", clip.file);
    return;
  }
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key, accept: "audio/mpeg" },
      body: JSON.stringify({
        text: clip.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      }),
    }
  );
  if (!resp.ok) {
    console.log("fail", clip.file, resp.status);
    return;
  }
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(out, Buffer.from(await resp.arrayBuffer()));
  console.log("ok", clip.file);
}

const e = { ...process.env };
loadEnv(masEnv, e);
const key = e.ELEVENLABS_API_KEY || "";
if (!key) {
  console.log("skip-no-key");
  process.exit(0);
}
for (const clip of CLIPS) await synth(key, clip);
