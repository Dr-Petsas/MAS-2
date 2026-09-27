import assert from "node:assert/strict";
import {
  buildPortalAiMessages,
  parsePortalAiJson,
  PORTAL_AI_OPERATIONS,
} from "../src/routes/portalCreate.js";

assert.deepEqual(PORTAL_AI_OPERATIONS, [
  "titles",
  "script",
  "storyboard",
  "image_prompt",
  "board_bullets",
]);

assert.deepEqual(
  parsePortalAiJson('```json\n{"titles":["A","B"]}\n```'),
  { titles: ["A", "B"] },
);
assert.equal(parsePortalAiJson("keine json-antwort"), null);

const messages = buildPortalAiMessages("storyboard", {
  topic: "Implantat-Nachsorge",
  context: "Die Praxis empfiehlt am ersten Tag zu kühlen.",
});
assert.equal(messages.length, 2);
assert.match(messages[0].content, /Create-Studio-Gehirn/);
assert.match(messages[0].content, /lipsync\|ambient\|board/);
assert.match(messages[1].content, /Implantat-Nachsorge/);
assert.match(messages[1].content, /am ersten Tag zu kühlen/);

const clipped = buildPortalAiMessages("script", {
  topic: "x".repeat(900),
  context: "y".repeat(9000),
});
assert.ok(clipped[1].content.length < 7500, "input must be bounded");

console.log("portalCreate.test: ok");
