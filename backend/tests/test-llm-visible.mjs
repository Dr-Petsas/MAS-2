import { visibleLlmText } from "../src/mail/llm.js";

let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

check(visibleLlmText("Hallo Welt") === "Hallo Welt", "Klartext unverändert");
check(visibleLlmText("<think>geheim</think>Sicht") === "Sicht", "fertigen Denkblock entfernen");
check(visibleLlmText("Vor<think>noch offen") === "Vor", "offenen Denkblock verbergen");
check(visibleLlmText("Text<thi") === "Text", "angeanfangtes Tag am Ende verbergen");
check(visibleLlmText("A <think>x</think>B") === "A B", "Denkblock in der Mitte");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
