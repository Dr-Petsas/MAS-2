import assert from "node:assert/strict";
import { bonusAusBesuchen } from "../src/hkp/coach.js";

const heute = new Date("2026-11-11T12:00:00Z");
const wer = "Frau Kassentest";
const jahre = (...ys) => bonusAusBesuchen(ys.map((y) => `${y}-06-01`), { heute, wer });

const zehnVorher = jahre(2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025);
assert.equal(zehnVorher.bonus, "75");
assert.equal(zehnVorher.hinweis, "75 Prozent.");

const fuenfVorher = jahre(2021, 2022, 2023, 2024, 2025);
assert.equal(fuenfVorher.bonus, "70");
assert.equal(fuenfVorher.hinweis, "70 Prozent.");

const fuenfMitDiesem = jahre(2022, 2023, 2024, 2025, 2026);
assert.equal(fuenfMitDiesem.bonus, "70");

const zehnMitDiesem = jahre(2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026);
assert.equal(zehnMitDiesem.bonus, "75");

const luecke = jahre(2021, 2022, 2024, 2025, 2026);
assert.equal(luecke.bonus, "60");
assert.equal(luecke.hinweis, "Ohne Bonus.");

const leer = bonusAusBesuchen([], { heute, wer });
assert.equal(leer.bonus, "60");
assert.equal(leer.hinweis, "Ohne Bonus.");

const ms = bonusAusBesuchen([Date.parse("2024-03-01T10:00:00Z"), Date.parse("2025-03-01T10:00:00Z")], { heute, wer });
assert.equal(ms.bonus, "60");

console.log("bonus aus besuchen ok");
