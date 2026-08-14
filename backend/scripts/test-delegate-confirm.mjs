// Super-GAU 14.08.2026: Haila-Karte richtig, wildfremde Nummer gewählt.
// Pure Guards — kein Twilio, kein Firestore.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseDialPhone,
  canConfirmLisaCall,
  nameTokensOverlap,
  normalizePhoneE164,
} from "../src/lisa/outbound.js";
import { karteLisaLive } from "../src/clara/karten.js";

test("Haila-Datensatz schlaegt erfundene LLM-Nummer", () => {
  const pick = chooseDialPhone({
    recordPhone: "017612345678",
    claimedPhone: "01763069747",
  });
  assert.equal(pick.source, "record");
  assert.equal(pick.rejectedClaim, true);
  assert.equal(pick.phone, normalizePhoneE164("017612345678"));
  assert.notEqual(pick.phone, normalizePhoneE164("01763069747"));
});

test("gleiche Nummer in anderem Format bleibt Datensatz", () => {
  const pick = chooseDialPhone({
    recordPhone: "+49 176 12345678",
    claimedPhone: "017612345678",
  });
  assert.equal(pick.source, "record");
  assert.equal(pick.rejectedClaim, false);
  assert.equal(pick.phone, normalizePhoneE164("017612345678"));
});

test("ohne Datensatz wird eine LLM-Nummer verworfen", () => {
  const pick = chooseDialPhone({
    recordPhone: "",
    claimedPhone: "01763069747",
    allowClaimed: false,
  });
  assert.equal(pick.phone, "");
  assert.equal(pick.source, "rejected_llm");
  assert.equal(pick.rejectedClaim, true);
});

test("Chef hat die Nummer selbst gesagt und kein Datensatz", () => {
  const pick = chooseDialPhone({
    recordPhone: "",
    claimedPhone: "01776004600",
    allowClaimed: true,
  });
  assert.equal(pick.source, "spoken");
  assert.equal(pick.phone, normalizePhoneE164("01776004600"));
});

test("confirm=true ohne vorherige Vorschau darf nicht waehlen", () => {
  assert.equal(canConfirmLisaCall(null), false);
  assert.equal(canConfirmLisaCall({ phone: "017612345678", instruction: "Termin absagen", at: 0 }), false);
  assert.equal(canConfirmLisaCall({
    phone: "017612345678",
    instruction: "Sagen Sie bitte, dass der Termin am Montag nicht stattfinden kann.",
    at: Date.now() - 11 * 60 * 1000,
  }), false);
});

test("confirm gilt nur nach frischer Vorschau mit Datensatz-Nummer", () => {
  assert.equal(canConfirmLisaCall({
    phone: "017612345678",
    instruction: "Sagen Sie bitte, dass der Termin am Montag nicht stattfinden kann.",
    at: Date.now() - 20 * 1000,
  }), true);
});

test("El-Otmani trifft Haila El Otmani, nicht einen Fremdkontakt", () => {
  assert.equal(nameTokensOverlap("El-Otmani", "Haila El Otmani"), true);
  assert.equal(nameTokensOverlap("Haila El-Otmani", "Haila El Otmani"), true);
  assert.equal(nameTokensOverlap("Haila", "Feinkost Exotica"), false);
});

test("Lisa-Karte im Confirm-Status hat keine Task-Id und sagt noch kein Anruf", () => {
  const card = karteLisaLive({
    contactName: "Haila El Otmani",
    phone: "+4917612345678",
    status: "confirm",
    instruction: "Termin am Montag kann nicht stattfinden.",
  });
  assert.equal(card.kind, "lisa_live");
  assert.equal(card.taskId, "");
  assert.equal(card.status, "confirm");
  assert.match(card.subtitle, /bestätigen|kein Anruf/i);
  assert.match(card.detail, /Haila/);
});
