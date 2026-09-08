import { openCallerHits, eventMatchesPhone, canonDigits } from "../src/bianca/callerContext.js";

function check(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log("ok", msg);
}

const phone = "01771234567";
check(canonDigits("+49 177 1234567") === "01771234567", "E.164 auf national");
check(eventMatchesPhone({ counterparty: { ref: "+491771234567" } }, phone), "ref match");
check(eventMatchesPhone({ summary: "hat am 8.9. 0177 1234567 Meier angerufen" }, phone), "summary match");

const events = [
  { id: "a", ts: 30, status: "open", summary: "Narval abholbereit", counterparty: { ref: "01771234567", name: "Meier" } },
  { id: "b", ts: 40, status: "resolved", summary: "Narval abholbereit", counterparty: { ref: "01771234567", name: "Meier" } },
  { id: "c", ts: 50, status: "none", summary: "Interner Vermerk 01771234567", counterparty: { ref: "01771234567" } },
  { id: "d", ts: 60, status: "open", summary: "andere Nummer", counterparty: { ref: "01511111111" } },
];
const hits = openCallerHits(events, phone);
check(hits.length === 1 && hits[0].id === "a", "nur offene Treffer zur Nummer");
check(openCallerHits(events, "12").length === 0, "kurze Nummer ignorieren");
console.log("caller-context filter ok");
