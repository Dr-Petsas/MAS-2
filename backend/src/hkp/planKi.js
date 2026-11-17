/**
 * KI-Zeile im offenen PlanR-Plan: das Modell bekommt den ganzen Plan (Positionen, Schalter,
 * Prüfhinweise), dazu Ausschluss-Tabelle und Abrechnungswissen, und antwortet auf genau
 * diesen Plan. Änderungen kommen als Schritte zurück; der Planer führt sie aus.
 * Hier wird nichts gespeichert und kein Patient übergeben.
 */
import { ausschluesseZwischen, ausschlussSatz, ausschlussTabelle, planPruefen } from "./ausschluss.js";

export const PLAN_KI_SYSTEM = `Du bist Clara, die Abrechnungsassistentin in PlanR. Der Zahnarzt hat genau EINEN Plan geöffnet und schreibt in die KI-Zeile dieses Plans. Du bekommst:
- PLAN: Planart, alle Positionen (id, ebene, nr, zahn, anzahl, faktor, betrag, text, ggf. begruendung; herkunft "planer" = vom Planer aus Schalter oder Befund errechnet, herkunft "hand" = von Hand oder über diese Zeile ergänzt), Summen, Angaben.
- SCHALTER: Einstellungen des Planers mit ihrem jetzigen Wert. Ein Schalter bringt seine Leistungen samt Begleitleistungen und Ausschlüssen selbst. Schalter sind auch die Angaben zur Ausführung des ganzen Plans (je nach Planer: Bonus, Härtefall, Versorgungsart, Abformung, Labor, Kronenmaterial, Verblendung, Implantatangaben); "text" sagt, was der Schalter bedeutet, "werte" nennt die erlaubten Werte.
- ZAHNSCHEMA: die Felder, die du je Zahn ändern darfst (Befund, Planung und was der Planer sonst je Zahn führt), jedes mit seinen erlaubten Werten und deren Bedeutung. Der jetzige Stand je Zahn steht in PLAN unter angaben oder in den Positionen.
- PRÜFHINWEISE: was das Prüfmodul an diesem Plan gefunden hat, je Zeile [stufe] art=<Art> ids=<betroffene Positionen mit ihrer herkunft>: Text. Die ids sind ids aus PLAN.
- GENANNTE NUMMERN: für jede Nummer aus dem Satz, ob sie im PLAN steht und ob ein Ausschluss der Tabelle an diesem Plan greift. Das ist geprüft und gilt vor allem anderen. Ein SCHALTER mit wert=false bedeutet: seine Leistung steht NICHT im Plan.
- AUSSCHLUSS-TABELLE: gilt immer, auch gegen deine Erinnerung.
- WISSEN: Auszüge aus den Abrechnungsbestimmungen.

Regeln:
1. Du sprichst immer über diesen Plan. Frage nie nach dem Patientennamen und nie, welcher Plan gemeint ist.
2. Antworte auf Deutsch, höchstens vier Sätze (beim Prüfen und Korrigieren höchstens sechs), konkret: Nummern, Zähne oder Regionen und Beträge aus PLAN. Erfinde keine Positionen, Beträge oder Bestimmungen. Steht etwas weder in PLAN noch in WISSEN oder der Tabelle, sag das offen.
3. Fragt er, ob eine Leistung noch dazu kann: prüfe, ob sie schon im PLAN steht (dann nenne Zahn, Anzahl, Betrag), ob die AUSSCHLUSS-TABELLE sie neben einer Position des Plans am selben Zahn oder in derselben Region ausschließt, und was WISSEN verlangt. Nenne den Grund. Ein Ausschluss greift nur gegen eine Nummer, die laut PLAN wirklich im Plan steht; steht die andere Nummer nicht im Plan, ist die Leistung daran nicht gehindert (du darfst erwähnen, dass beide nicht zusammen gehen). Was eine Nummer bedeutet, nimmst du aus PLAN, SCHALTER oder WISSEN, nicht aus der Erinnerung.
4. Will er eine Änderung, oder fragt er, ob etwas geht, und bittet zugleich darum: gib die Schritte dafür, aber nur wenn die Änderung zulässig ist. Ist sie es nicht, gib keine Schritte und nenne den Grund.
5. Schalter vor "hinzu": Gibt es einen SCHALTER, der die gewünschte Leistung bringt, nimm den Schalter. Nur ohne passenden Schalter eine Position mit "hinzu".
6. Fehlt eine nötige Angabe (Zahn oder Region) und kommen mehrere in Frage, stelle genau EINE Rückfrage und gib keine Schritte. Kommt nur ein Zahn oder eine Region in Frage, nimm diese.
7. Ist der Plan gesperrt (gesperrt=true), änderst du nichts und sagst, dass er freigegeben ist.
8. Nimm nur Schritt-Arten aus ERLAUBT. Für "weg" und "setze" nur ids aus PLAN, für "schalter" nur Namen aus SCHALTER.
9. In "antwort" steht bei einer Änderung, was du änderst und warum das zulässig ist. Schritte werden sofort ausgeführt: bitte dann nicht um Bestätigung. Neue Summen nennst du nicht, die meldet die Seite nach der Änderung selbst.

Prüfen und Korrigieren:
Bittet er darum, den Plan zu prüfen, zu korrigieren, in Ordnung zu bringen oder die Meldungen des Prüfmoduls zu beheben, arbeitest du die PRÜFHINWEISE mit stufe fehler und warnung ab. Du allein entscheidest aus dem Satz, ob das gemeint ist. Setze dann "pruefung":true. Will er nur wissen, was das Prüfmodul meldet, erkläre die Meldungen und ändere nichts. Nennt er nur einen Teil ("nur die Begründungen"), behebe nur diesen Teil. Je Art:
- begruendung_fehlt: je id ein "setze" mit "begruendung". Ein Satz, der den erhöhten Aufwand DIESER Leistung beschreibt (Schwierigkeit, Zeitaufwand, Umstände der Ausführung), abgeleitet nur aus Leistungstext, Zahn oder Region dieser einen Position. Übernimm keine Befunde aus der Begründung einer anderen Position. Kein Patientenname, keine erfundenen Befunde oder Diagnosen. Sage in der Antwort, dass es Vorschläge sind, die die Praxis vor dem Ausdruck prüft. Hat die Position in PLAN schon eine begruendung, lass sie.
- faktor_ueber_35: ohne Vereinbarung nach § 2 GOZ ist höchstens 3,5 zulässig. Setze den faktor auf 3.5 und gib eine begruendung dazu, wenn keine da ist. Sagt er, dass eine Vereinbarung besteht, ändere den Faktor nicht und nenne die Einstellung der Praxis dafür.
- faktor_ueber_35_vereinbart: nur erwähnen, nichts ändern.
- faktor_unter_1: setze faktor 1, wenn der Satz nichts anderes verlangt.
- anzahl_null, kein_betrag: eine Position mit herkunft "hand" mit "weg" entfernen. Eine Position mit herkunft "planer" kommt aus einem Schalter oder der Rechnung: nicht entfernen, sondern erklären, woran es liegt.
- kein_preis: der Preis fehlt. Erfinde keinen. Frage nach dem Preis und gib für diese Position keinen Schritt.
- kein_text: melden, nichts ändern.
- doppelt, ausschluss: hier entscheidet immer die Praxis, welche Position bleibt. Im Korrekturlauf gibst du dafür KEINEN Schritt (kein "weg", kein "schalter") und erwähnst diese Meldungen in "antwort" nicht: das Programm stellt die Rückfrage selbst und nennt die betroffenen Positionen. Erst wenn der Satz des Arztes selbst sagt, welche Position gehen oder bleiben soll (auch als Antwort auf diese Rückfrage, siehe VERLAUF), setzt du "entschieden":true und gibst genau die Schritte, die er verlangt: "weg" für die genannte Position; eine Position mit herkunft "planer" über ihren SCHALTER, wenn einer sie bringt. Sagt er, dass die doppelten Positionen bleiben sollen, änderst du daran nichts. Nennt er eine Nummer, die mehrfach gemeint sein kann, frage nach Zahn oder Region. An einer Position, die du im selben Zug entfernst, änderst du sonst nichts.
- rechnung: Hinweis der Rechnung des Planers. Erklären; ändern nur über einen passenden SCHALTER.
Eine Position mit herkunft "planer" verschwindet über ihren SCHALTER; "weg" nimmst du für sie nur, wenn kein Schalter sie bringt (manche Planer lehnen das ab, das meldet die Seite dann). Ein "schalter"-Schritt muss den Wert ändern: ein Schalter, der schon aus ist, bringt keine Leistung und löst nichts.
In "antwort" nennst du Positionen mit Nummer und Zahn oder Region, nie mit ihrer id und ohne die Wörter "hand" und "planer".
10. Zahnschema: Soll sich am Befund oder an der Planung eines Zahns etwas ändern (Zahn fehlt, Implantat dazu oder weg, Krone statt Brückenglied, andere Füllung, andere Fläche, anderes Implantatsystem …) und steht "zahn" in ERLAUBT, gib je Zahn EINEN Schritt "zahn" mit nur den Feldern, die sich ändern, und nur Werten aus ZAHNSCHEMA (der Schlüssel, nicht die Bedeutung). Der Planer rechnet danach alle Positionen selbst neu: gib dazu KEIN "hinzu", "weg" oder "setze" für Positionen, die aus dem Zahnschema errechnet werden. Ein leerer Wert "" nimmt den Eintrag heraus, wenn ZAHNSCHEMA ihn anbietet. Nennt der Arzt eine Versorgung, für die es mehrere passende Kürzel gibt, und ergibt sich die Wahl nicht aus dem übrigen Plan, frage nach. Zahnnummern sind FDI (11 bis 48): 1x Oberkiefer rechts, 2x Oberkiefer links, 3x Unterkiefer links, 4x Unterkiefer rechts; "Regio 26" ist der Zahn 26. Eine zweistellige Zahl wie 26 im Satz ist ein Zahn, keine Gebührennummer. Das Zahnschema gilt für jeden Zahn, auch wenn sein Kiefer oder seine Region bisher nicht im Plan vorkommt: die Region kommt mit dem Zahn von selbst dazu. Brücke "von A auf B": A und B sind die Pfeiler und bekommen ein Kronen- bzw. Ankerkürzel; nur die fehlenden Zähne dazwischen bekommen Befund fehlend und ein Brückenglied-Kürzel. Ein Brückenglied steht nie auf einem vorhandenen Zahn, ein Pfeiler nie auf einem fehlenden. Gib dafür je betroffenem Zahn einen Schritt. Ist nicht klar, welcher Zahn gemeint ist, frage nach. Ein Zahn, der bisher nicht im Plan steht, kommt mit dem Schritt "zahn" dazu: das ist der normale Weg, einen Plan zu erweitern, kein Hindernis. Was an einem Zahn schon eingetragen ist, bleibt bestehen, wenn du das Feld weglässt (wechselt nur die Art der Versorgung, bleiben z. B. die Flächen). Nimmst du einen Befund heraus, auf dem die Planung desselben Zahns beruht, nimm die Planung im selben Schritt mit heraus. Ein Feld mit "ja":true nimmt true oder false, ein Feld mit "von"/"bis" eine Zahl in diesen Grenzen, ein Feld mit "werte" einen der Schlüssel. Felder, die der Arzt nicht nennt (System, Maße, Zeitpunkt, Material …), lässt du weg: der Planer nimmt dafür seine Vorgaben bzw. die der übrigen Zähne. Frage nicht danach, sondern führe aus; der Arzt kann sie danach ändern. Sagt er, dass ein Zahn fehlt, und soll dort etwas geplant werden, setze Befund und Planung im selben Schritt. Eine Brücke "von 14 auf 16" heißt: die beiden Endzähne werden Brückenpfeiler, jeder Zahn dazwischen wird Brückenglied; gib dafür je Zahn einen Schritt "zahn", auch für Zähne, die bisher nicht im Plan stehen. Ob ein Pfeilerzahn fehlt, sagt nur der Arzt: ein Pfeiler ist ein vorhandener Zahn.
11. Angaben zur Ausführung: Nennt der Arzt etwas, das ein SCHALTER führt (Bonusheft, Härtefall, Intraoralscan oder Abdruck, Eigen- oder Fremdlabor, Material aller Kronen, Verblendung, Abutment …), gib einen Schritt "schalter" mit dem Namen aus SCHALTER und einem Wert aus dessen "werte" (bei einem Ja/Nein-Schalter true oder false). Welcher Wert gemeint ist, entnimmst du dem "text" des Schalters. Gilt die Angabe für den ganzen Plan ("alles aus Zirkon"), nimm den Schalter; gilt sie für einzelne Zähne ("die Krone 16 aus Gold") und führt ZAHNSCHEMA dafür ein Feld, gib je Zahn einen Schritt "zahn" mit diesem Feld. Der Planer rechnet danach selbst neu. Fehlt der Schalter in SCHALTER, führt dieser Plan die Angabe gerade nicht (zum Beispiel kein Kronenmaterial ohne Krone): sage das, statt etwas anderes zu ändern. Ein Schalter, dessen "wert" eine Zahl ist (Faktor, Stufe, Preisklasse, Zielbetrag, Anzahl), bekommt eine Zahl; die Grenzen und die Bedeutung der Stufen nennt sein "text". Ein Schalter ohne "werte", dessen "wert" Text ist (Bemerkung, Diagnose, Therapie), nimmt freien Text: gib den ganzen neuen Text; soll etwas ergänzt werden, gib den bisherigen Text samt Ergänzung, soll er geleert werden, gib "". Nennt der Arzt einen Zielbetrag, einen Wunschpreis oder einen gewünschten Eigenanteil ("mach das für 800 Euro", "der Patient soll höchstens 500 zuzahlen") und führt SCHALTER dafür einen Zielbetrag, gib genau diesen einen Schritt mit dem Betrag als Zahl: der Planer stellt seine Preisregler selbst passend ein; ändere dafür keine einzelnen Faktoren und keine Positionen. Steht bei einem Material in ANGABEN "Vorgabe, noch nicht gewählt" und nennt der Arzt genau dieses Material, setze es trotzdem: erst damit ist es gewählt. Begleit- und Zusatzleistungen, die SCHALTER oder ZAHNSCHEMA als Ja/Nein führen (Kofferdam, Mikroskop, Membran, Sedierung …), schaltest du dort; "hinzu" nimmst du nur für Leistungen, die es dort nicht gibt. Führt SCHALTER einen Eintrag "bruecke", planst du eine Brücke "von A auf B" nur mit diesem einen Schritt und gibst für ihre Zähne keine Schritte "zahn"; eine Ausführung hängst du nur an, wenn der Arzt sie nennt. Wiederherstellungen an vorhandenem Zahnersatz (Prothese gebrochen oder gesprungen, Klammer, Unterfütterung, Erweiterung, Krone oder Brücke wieder einsetzen, Verblendung erneuern) stehen in SCHALTER als "reparatur.…": nimm den Eintrag, dessen "text" passt, mit dem Gebiet als Wert; der reparierte Zahnersatz muss dafür nicht im Plan stehen. Passen mehrere Einträge gleich gut, frage nach.

Beim Korrigieren fasst du nur Positionen an, die in den ids einer Meldung stehen, und änderst nur, was die Meldung verlangt: kein anderer Faktor, keine andere Anzahl, keine neue Position. Das Programm verwirft alles andere.
Steht eine Schritt-Art nicht in ERLAUBT, sage, was die Praxis im Planer selbst tun muss. Was du nicht sicher lösen kannst, lässt du offen und nennst es. Behaupte nie, eine Meldung sei behoben: die Seite prüft den Plan nach deinen Schritten neu und meldet selbst, was erledigt und was offen ist.
Steht unter NACH DEINEN SCHRITTEN ein Abschnitt, hast du in diesem Auftrag schon geändert; PLAN und PRÜFHINWEISE zeigen den Stand danach. Behebe nur, was noch offen ist. Wiederhole keinen Schritt, der dort als abgelehnt steht, und nimm nichts zurück, was du gerade geändert hast. Kannst du nichts mehr tun, gib keine Schritte und sage in einem Satz, was offen bleibt und warum.

Schritte:
{"op":"schalter","name":"<Name aus SCHALTER>","wert":true}
{"op":"hinzu","ebene":"GOZ","nr":"9100","zahn":"16","anzahl":1,"faktor":2.3}
{"op":"setze","id":"<id>","anzahl":2,"faktor":3.5,"begruendung":"..."}
{"op":"weg","id":"<id>"}
{"op":"zahn","zahn":"16","felder":{"<Feldname aus ZAHNSCHEMA>":"<Wert>"}}
{"op":"zurueck"}   (nimmt die letzte Änderung aus dieser Zeile zurück)

Antworte nur mit JSON, die Felder in dieser Reihenfolge: {"aendert":false,"schritte":[...],"antwort":"...","pruefung":false}. Entscheide zuerst "aendert", schreibe dann die Schritte und erst danach die Antwort. Ohne Änderung ist schritte leer. "aendert" ist true, wenn du in diesem Zug etwas am Plan änderst; dann MUSS "schritte" die Schritte dafür enthalten, denn nur Schritte ändern den Plan, der Text in "antwort" ändert nichts. "antwort" ist für den Arzt geschrieben: das Ergebnis, nicht deine Überlegung, keine Feld- oder Schalternamen. "pruefung" ist true, wenn der Auftrag das Prüfen und Korrigieren ist. "entschieden":true kommt nur dazu, wenn der Satz selbst festlegt, welche Position einer doppelt- oder ausschluss-Meldung geht oder bleibt. Kein Markdown.`;

const OPS = ["schalter", "hinzu", "setze", "weg", "zurueck", "zahn"];
/** Arten der Prüfmodul-Meldungen, wie PlanR sie mitgibt (_gemeinsam/src/planKi.ts PruefArt) */
const PRUEF_ARTEN = ["anzahl_null", "kein_betrag", "kein_preis", "kein_text", "faktor_ueber_35", "faktor_ueber_35_vereinbart", "faktor_unter_1", "begruendung_fehlt", "doppelt", "ausschluss", "rechnung"];
/** So viele Schritte nimmt ein Zug an: ein Plan mit vielen gesteigerten Leistungen braucht je Zeile eine Begründung. */
export const PLAN_KI_SCHRITTE = 60;
const klein = (s) => String(s || "").toLowerCase();
const zahl = (x) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() && Number.isFinite(Number(x.replace(",", "."))) ? Number(x.replace(",", ".")) : null);

/** Plan aus dem Browser auf das Nötige kürzen; nichts davon ist ein Patientenfeld. */
export function blickSaeubern(roh) {
  const b = roh && typeof roh === "object" ? roh : {};
  const s = (x, n) => String(x ?? "").slice(0, n);
  const positionen = (Array.isArray(b.positionen) ? b.positionen : []).slice(0, 400).map((p) => ({
    id: s(p?.id, 80), ebene: s(p?.ebene, 8), nr: s(p?.nr, 24), zahn: s(p?.zahn, 60),
    anzahl: zahl(p?.anzahl) ?? 1,
    ...(zahl(p?.faktor) != null ? { faktor: zahl(p.faktor) } : {}),
    betrag: zahl(p?.betrag) ?? 0, text: s(p?.text, 140),
    ...(p?.auto ? { auto: true } : {}),
    ...(typeof p?.begruendung === "string" && p.begruendung.trim() ? { begruendung: s(p.begruendung.trim(), 300) } : {}),
    ...(p?.ohnePreis ? { ohnePreis: true } : {}),
    ...(zahl(p?.sitzung) != null ? { sitzung: zahl(p.sitzung) } : {}),
  })).filter((p) => p.id && p.nr);
  const schalter = (Array.isArray(b.schalter) ? b.schalter : []).slice(0, 120).map((x) => ({
    name: s(x?.name, 80), text: s(x?.text, 240),
    wert: typeof x?.wert === "boolean" || typeof x?.wert === "number" ? x.wert : s(x?.wert, Array.isArray(x?.werte) ? 60 : 400),
    ...(Array.isArray(x?.werte) ? { werte: x.werte.slice(0, 40).map((w) => s(w, 60)) } : {}),
  })).filter((x) => x.name);
  const zahnfelder = (Array.isArray(b.zahnfelder) ? b.zahnfelder : []).slice(0, 16).map((x) => ({
    name: s(x?.name, 40), text: s(x?.text, 200),
    ...(x?.werte && typeof x.werte === "object" ? { werte: Object.fromEntries(Object.entries(x.werte).slice(0, 160).map(([k, v]) => [s(k, 24), s(v, 120)])) } : {}),
    ...(zahl(x?.von) != null && zahl(x?.bis) != null ? { von: zahl(x.von), bis: zahl(x.bis) } : {}),
    ...(x?.ja === true ? { ja: true } : {}),
  })).filter((x) => x.name && (x.werte || x.ja || x.von != null));
  const paare = (o, n) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).slice(0, n).map(([k, v]) => [s(k, 40), typeof v === "number" ? v : s(v, 300)]));
  const ids = new Set(positionen.map((p) => p.id));
  const hinweise = (Array.isArray(b.hinweise) ? b.hinweise : []).slice(0, 80).map((h) => ({
    stufe: s(h?.stufe, 10), text: s(h?.text, 300),
    ...(PRUEF_ARTEN.includes(h?.art) ? { art: h.art } : {}),
    ...(Array.isArray(h?.ids) && h.ids.some((i) => ids.has(String(i))) ? { ids: h.ids.map(String).filter((i) => ids.has(i)).slice(0, 12) } : {}),
  })).filter((h) => h.text);
  return {
    planart: s(b.planart, 40), name: s(b.name, 80), gesperrt: b.gesperrt === true,
    kann: (Array.isArray(b.kann) ? b.kann : []).map(String).filter((o) => OPS.includes(o)),
    ebenen: (Array.isArray(b.ebenen) ? b.ebenen : []).slice(0, 10).map((e) => s(e, 8)),
    positionen, schalter, zahnfelder, summen: paare(b.summen, 20), angaben: paare(b.angaben, 30),
    hinweise,
  };
}

/** Wörter des Satzes, die eine Nummer sein können (enthalten eine Ziffer) */
function nummernImSatz(text) {
  return [...new Set(String(text || "").split(/[^0-9A-Za-zÄÖÜäöü]+/).filter((w) => w && w.length <= 8 && /\d/.test(w)).map(klein))];
}

/** Sätze der Ausschluss-Tabelle: gefragte Nummer gegen den Plan, und Paare im Plan selbst */
export function tabelleFuer(text, blick) {
  const gefragt = nummernImSatz(text);
  const imPlan = [...new Set(blick.positionen.map((p) => klein(p.nr)))];
  const saetze = new Set();
  if (gefragt.length) {
    for (const e of ausschluesseZwischen([...gefragt, ...imPlan])) {
      if (gefragt.includes(klein(e.a)) || gefragt.includes(klein(e.b))) saetze.add(ausschlussSatz(e));
    }
  }
  for (const t of planPruefen(blick.positionen)) saetze.add(t.hinweis);
  return [...saetze].slice(0, 12);
}

/** Prüfmodul: Ausschlüsse zwischen den Positionen eines Plans, mit Fundstelle */
export function planPruefung(positionen) {
  const pos = (Array.isArray(positionen) ? positionen : []).slice(0, 400)
    .map((p) => ({ ebene: String(p?.ebene || "").slice(0, 8), nr: String(p?.nr || "").slice(0, 24), zahn: String(p?.zahn || "").slice(0, 60) }))
    .filter((p) => p.ebene && p.nr);
  const gesehen = new Set();
  const raus = [];
  for (const t of planPruefen(pos)) {
    if (gesehen.has(t.hinweis)) continue;
    gesehen.add(t.hinweis);
    raus.push({ stufe: "fehler", text: t.hinweis, a: t.a, b: t.b, katalog: t.k });
  }
  return raus.slice(0, 40);
}

/** Je genannter Nummer: steht sie im Plan, und wo */
const zahnNr = (z) => z.length === 2 && "1234".includes(z[0]) && "12345678".includes(z[1]);

export function genannteNummern(text, blick) {
  return nummernImSatz(text).slice(0, 8).map((n) => {
    const da = blick.positionen.filter((p) => klein(p.nr) === n);
    const stand = da.length
      ? `${n}: steht im Plan (${da.map((p) => `${p.ebene}${p.zahn ? ` ${p.zahn}` : ""}, ${p.anzahl}x, ${p.betrag.toFixed(2)} EUR`).join("; ")})`
      : `${n}: steht NICHT im Plan`;
    const partner = [...new Set(ausschlussTabelle().filter((e) => klein(e.a) === n || klein(e.b) === n).map((e) => klein(klein(e.a) === n ? e.b : e.a)))].slice(0, 12);
    // Eine Zahnnummer (FDI), die weder als Leistung im Plan steht noch in der Tabelle vorkommt, ist ein Zahn und keine Gebührennummer.
    if (!partner.length && !da.length && zahnNr(n)) return "";
    if (!partner.length) return `${stand}. Die Ausschluss-Tabelle kennt zu ${n} keinen Eintrag.`;
    const drin = partner.filter((x) => blick.positionen.some((p) => klein(p.nr) === x));
    const fehlt = partner.filter((x) => !drin.includes(x));
    return `${stand}. Laut Tabelle nicht neben: ${partner.join(", ")}. Davon im Plan: ${drin.join(", ") || "keine"}${fehlt.length ? `; NICHT im Plan: ${fehlt.join(", ")}` : ""}. ${drin.length ? "Ein Ausschluss greift." : "Aus der Tabelle greift an diesem Plan kein Ausschluss."}`;
  }).filter(Boolean);
}

/** Was der Planer aus der vorigen Runde dieses Auftrags gemeldet hat */
function nachlaufText(n) {
  if (!n || typeof n !== "object") return "";
  const liste = (x) => (Array.isArray(x) ? x : []).slice(0, 60).map((t) => `- ${String(t || "").slice(0, 300)}`).join("\n");
  const getan = liste(n.getan), nicht = liste(n.nicht);
  if (!getan && !nicht) return "";
  return `NACH DEINEN SCHRITTEN (Runde ${Number(n.runde) || 2} dieses Auftrags; PLAN und PRÜFHINWEISE oben sind der Stand danach):\nAusgeführt:\n${getan || "- nichts"}\nVom Planer abgelehnt:\n${nicht || "- nichts"}`;
}

export function planKiNachricht({ text, blick, verlauf = [], tabelle = [], wissen = "", nachlauf = null }) {
  const genannt = genannteNummern(text, blick);
  const zuvor = (Array.isArray(verlauf) ? verlauf : []).slice(-6)
    .map((z) => `${z?.wer === "clara" ? "Clara" : "Zahnarzt"}: ${String(z?.text || "").slice(0, 400)}`).join("\n");
  const herkunft = new Map(blick.positionen.map((p) => [p.id, p.auto ? "planer" : "hand"]));
  const positionen = blick.positionen.map(({ auto, ...p }) => ({ ...p, herkunft: auto ? "planer" : "hand" }));
  const plan = { planart: blick.planart, name: blick.name, gesperrt: blick.gesperrt, angaben: blick.angaben, summen: blick.summen, positionen };
  return [
    `ERLAUBT: ${blick.gesperrt ? "nichts (Plan gesperrt)" : blick.kann.join(", ") || "nichts (dieser Planer nimmt von hier noch keine Änderungen an)"}${blick.ebenen.length ? `\nEbenen für "hinzu": ${blick.ebenen.join(", ")}` : ""}`,
    `PLAN:\n${JSON.stringify(plan)}`,
    `SCHALTER:\n${blick.schalter.length ? JSON.stringify(blick.schalter) : "keine"}`,
    blick.zahnfelder?.length ? `ZAHNSCHEMA (Felder für den Schritt "zahn"):\n${JSON.stringify(blick.zahnfelder)}` : "",
    `PRÜFHINWEISE:\n${blick.hinweise.length ? blick.hinweise.map((h) => `- [${h.stufe}]${h.art ? ` art=${h.art}` : ""}${h.ids?.length ? ` ids=${h.ids.map((i) => `${i}(${herkunft.get(i)})`).join(",")}` : ""}: ${h.text}`).join("\n") : "keine"}`,
    `AUSSCHLUSS-TABELLE:\n${tabelle.length ? tabelle.map((t) => `- ${t}`).join("\n") : "kein Treffer zu den genannten Nummern und diesem Plan"}`,
    `WISSEN:\n${String(wissen || "").slice(0, 6000) || "nichts gefunden"}`,
    zuvor ? `BISHER IN DIESER ZEILE:\n${zuvor}` : "",
    nachlaufText(nachlauf),
    genannt.length ? `GENANNTE NUMMERN (vom Programm am PLAN geprüft, verbindlich; deine Antwort darf dem nicht widersprechen. Steht hier "NICHT im Plan", dann behaupte nicht, die Nummer stehe im Plan):\n${genannt.map((g) => `- ${g}`).join("\n")}` : "",
    `Zahnarzt jetzt: «${String(text || "").slice(0, 1200)}»`,
  ].filter(Boolean).join("\n\n");
}

/**
 * Korrekturlauf: es bleibt nur, was eine Meldung des Prüfmoduls verlangt. Das Modell darf dabei
 * keinen Faktor anheben, keine unbeteiligte Position anfassen und nichts ergänzen.
 */
function nurZuMeldungen(schritte, blick, verworfen, entschieden) {
  const zu = (...arten) => new Set(blick.hinweise.filter((h) => arten.includes(h.art)).flatMap((h) => h.ids || []));
  // Bei doppelten und sich ausschliessenden Positionen entscheidet die Praxis (Dr. Petsas 16.11.2026: immer nachfragen).
  const wegErlaubt = entschieden ? zu("doppelt", "ausschluss", "anzahl_null", "kein_betrag") : zu("anzahl_null", "kein_betrag");
  const zuHoch = zu("faktor_ueber_35"), zuTief = zu("faktor_unter_1"), ohneGrund = zu("begruendung_fehlt");
  const schalterErlaubt = blick.hinweise.some((h) => h.art === "rechnung" || (entschieden && h.art === "ausschluss"))
    && (entschieden || !blick.hinweise.some((h) => h.art === "ausschluss"));
  const entfernt = new Set(schritte.filter((s) => s.op === "weg" && wegErlaubt.has(s.id)).map((s) => s.id));
  const pos = new Map(blick.positionen.map((p) => [p.id, p]));
  const raus = [];
  for (const s of schritte) {
    if (s.op === "weg") { if (wegErlaubt.has(s.id)) raus.push(s); else verworfen.push("weg ohne Meldung"); continue; }
    if (s.op === "schalter") { if (schalterErlaubt) raus.push(s); else verworfen.push("schalter ohne Meldung"); continue; }
    if (s.op === "setze") {
      if (entfernt.has(s.id)) { verworfen.push("setze an entfernter Position"); continue; }
      const neu = { op: "setze", id: s.id };
      if (s.faktor != null && ((zuHoch.has(s.id) && s.faktor <= 3.5) || (zuTief.has(s.id) && s.faktor >= 1 && s.faktor <= 2.3))) neu.faktor = s.faktor;
      // Eine Begründung nur, wo sie fehlt oder der Faktor über der Schwelle bleibt und noch keine da ist.
      if (s.begruendung && (ohneGrund.has(s.id) || (zuHoch.has(s.id) && !pos.get(s.id)?.begruendung))) neu.begruendung = s.begruendung;
      if (Object.keys(neu).length > 2) raus.push(neu); else verworfen.push("setze ohne Meldung");
      continue;
    }
    verworfen.push(`${s.op} im Korrekturlauf`);
  }
  return raus;
}

/** Rückfrage des Programms im Korrekturlauf: welche der doppelten oder sich ausschliessenden Positionen bleibt. */
export function planKiRueckfrage(blick) {
  const offen = blick.hinweise.filter((h) => h.art === "doppelt" || h.art === "ausschluss");
  if (!offen.length) return "";
  const punkt = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);
  const liste = offen.slice(0, 8).map((h) => punkt(h.text)).join(" ");
  const mehr = offen.length > 8 ? ` Dazu ${offen.length - 8} weitere Meldungen im Prüfmodul.` : "";
  return `Hier entscheiden Sie: ${liste}${mehr} Welche Position soll jeweils entfallen, oder soll es so bleiben?`;
}

/** FDI-Zahn des bleibenden Gebisses */
const istZahn = (z) => z.length === 2 && "1234".includes(z[0]) && "12345678".includes(z[1]);

const JA_WERTE = { true: true, ja: true, 1: true, false: false, nein: false, 0: false };

/** Schritt "zahn": nur Felder und Werte, die der Planer für sein Zahnschema gemeldet hat. */
function zahnSchritt(s, zahnfelder) {
  const zahn = String(s?.zahn ?? "").trim();
  if (!istZahn(zahn) || !s.felder || typeof s.felder !== "object") return null;
  const felder = {};
  for (const [name, roh] of Object.entries(s.felder).slice(0, 16)) {
    const f = zahnfelder.find((x) => x.name === name);
    if (!f) return null;
    if (f.ja) {
      const b = typeof roh === "boolean" ? roh : JA_WERTE[String(roh ?? "").trim().toLowerCase()];
      if (typeof b !== "boolean") return null;
      felder[name] = b;
    } else if (f.werte) {
      const wert = String(roh ?? "");
      const treffer = Object.keys(f.werte).find((k) => k === wert) ?? Object.keys(f.werte).find((k) => k.toLowerCase() === wert.toLowerCase());
      if (treffer === undefined) return null;
      felder[name] = treffer;
    } else {
      const n = zahl(roh);
      if (n == null || n < f.von || n > f.bis) return null;
      felder[name] = n;
    }
  }
  return Object.keys(felder).length ? { op: "zahn", zahn, felder } : null;
}

/** Antwort des Modells prüfen: nur Schritte, die dieser Plan zulässt. Ungültiges -> null. */
export function planKiLesen(rohText, blick) {
  const roh = String(rohText || "");
  const nachDenken = roh.lastIndexOf("</think>");
  const kern = nachDenken >= 0 ? roh.slice(nachDenken + 8) : roh;
  const start = kern.indexOf("{");
  const ende = kern.lastIndexOf("}");
  if (start < 0 || ende <= start) return null;
  let daten = null;
  try { daten = JSON.parse(kern.slice(start, ende + 1)); } catch { return null; }
  if (!daten || typeof daten !== "object") return null;
  const antwort = String(daten.antwort || "").trim().slice(0, 1200);
  if (!antwort) return null;
  const ids = new Set(blick.positionen.map((p) => p.id));
  const schalter = new Map(blick.schalter.map((s) => [s.name, s]));
  const kann = new Set(blick.gesperrt ? [] : blick.kann);
  const schritte = [];
  const verworfen = [];
  for (const s of (Array.isArray(daten.schritte) ? daten.schritte : []).slice(0, PLAN_KI_SCHRITTE)) {
    const op = String(s?.op || "");
    if (!kann.has(op)) { verworfen.push(op || "?"); continue; }
    if (op === "zurueck") { schritte.push({ op }); continue; }
    if (op === "weg") {
      if (ids.has(String(s.id))) schritte.push({ op, id: String(s.id) }); else verworfen.push("weg");
      continue;
    }
    if (op === "setze") {
      if (!ids.has(String(s.id))) { verworfen.push("setze"); continue; }
      const neu = { op, id: String(s.id) };
      const anzahl = zahl(s.anzahl), faktor = zahl(s.faktor), preis = zahl(s.preis);
      if (anzahl != null && anzahl >= 1 && anzahl <= 99) neu.anzahl = Math.round(anzahl);
      if (faktor != null && faktor >= 1 && faktor <= 10) neu.faktor = Math.round(faktor * 100) / 100;
      if (preis != null && preis >= 0 && preis <= 100000) neu.preis = Math.round(preis * 100) / 100;
      if (typeof s.begruendung === "string" && s.begruendung.trim()) neu.begruendung = s.begruendung.trim().slice(0, 300);
      if (Object.keys(neu).length > 2) schritte.push(neu); else verworfen.push("setze");
      continue;
    }
    if (op === "zahn") {
      const neu = zahnSchritt(s, blick.zahnfelder || []);
      if (neu) schritte.push(neu); else verworfen.push("zahn");
      continue;
    }
    if (op === "schalter") {
      const ziel = schalter.get(String(s.name));
      if (!ziel) { verworfen.push("schalter"); continue; }
      let wert = s.wert;
      if (typeof ziel.wert === "boolean") {
        if (typeof wert !== "boolean") { verworfen.push("schalter"); continue; }
      } else if (typeof ziel.wert === "number") {
        wert = zahl(wert);
        if (wert == null) { verworfen.push("schalter"); continue; }
      } else {
        wert = String(wert ?? "");
        if (ziel.werte && !ziel.werte.includes(wert)) { verworfen.push("schalter"); continue; }
        // Freitext (Bemerkung, Diagnose): begrenzt, damit ein Plan nicht überläuft.
        if (!ziel.werte) wert = wert.trim().slice(0, 600);
      }
      // Ein Schalter, der schon so steht, ändert nichts am Plan.
      if (wert === ziel.wert) { verworfen.push("schalter unverändert"); continue; }
      schritte.push({ op, name: ziel.name, wert });
      continue;
    }
    if (op === "hinzu") {
      const ebene = String(s.ebene || "").toUpperCase().replace("GOÄ", "GOAE");
      const nr = String(s.nr || "").trim().slice(0, 24);
      if (!nr || (blick.ebenen.length && !blick.ebenen.includes(ebene))) { verworfen.push("hinzu"); continue; }
      const neu = { op, ebene, nr, zahn: String(s.zahn ?? "").trim().slice(0, 40), anzahl: 1 };
      const anzahl = zahl(s.anzahl), faktor = zahl(s.faktor), preis = zahl(s.preis);
      if (anzahl != null && anzahl >= 1 && anzahl <= 99) neu.anzahl = Math.round(anzahl);
      if (faktor != null && faktor >= 1 && faktor <= 10) neu.faktor = Math.round(faktor * 100) / 100;
      if (preis != null && preis >= 0 && preis <= 100000) neu.preis = Math.round(preis * 100) / 100;
      if (typeof s.text === "string" && s.text.trim()) neu.text = s.text.trim().slice(0, 160);
      schritte.push(neu);
    }
  }
  const pruefung = daten.pruefung === true;
  const entschieden = daten.entschieden === true;
  const aendert = daten.aendert === true;
  const frage = pruefung && !entschieden ? planKiRueckfrage(blick) : "";
  return { antwort, schritte: pruefung ? nurZuMeldungen(schritte, blick, verworfen, entschieden) : schritte, verworfen, pruefung, frage, entschieden, aendert };
}
