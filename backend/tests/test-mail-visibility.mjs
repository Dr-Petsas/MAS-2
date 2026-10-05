// Private Postfächer dürfen nicht an Kollegen oder an anonyme Aufrufer.
import assert from "node:assert/strict";
import { canSeeMessage, visibleMailAccounts } from "../src/routes/_shared.js";

const accounts = [
  { id: "petsas", label: "Dr.Petsas", visibility: "private", ownerUserId: "owner-a" },
  { id: "patrikis", label: "Dr. Patrikis", visibility: "private", ownerUserId: "owner-b" },
  { id: "praxis", label: "Praxis", visibility: "praxis", ownerUserId: "" },
];

const petsas = visibleMailAccounts(accounts, { kind: "user", userId: "owner-a", isAdmin: true });
assert.deepEqual(petsas.accounts.map((a) => a.id).sort(), ["petsas", "praxis"]);
assert.equal(canSeeMessage(petsas, { accountId: "patrikis" }), false);
assert.equal(canSeeMessage(petsas, { accountId: "petsas" }), true);

const patrikis = visibleMailAccounts(accounts, { kind: "user", userId: "owner-b", isAdmin: false });
assert.deepEqual(patrikis.accounts.map((a) => a.id).sort(), ["patrikis", "praxis"]);
assert.equal(canSeeMessage(patrikis, { accountId: "petsas" }), false);

const anon = visibleMailAccounts(accounts, { kind: "anon", isAdmin: true, userId: "" });
assert.deepEqual(anon.accounts.map((a) => a.id), ["praxis"]);
assert.equal(canSeeMessage(anon, { accountId: "petsas" }), false);

const none = visibleMailAccounts(accounts, {});
assert.deepEqual(none.accounts.map((a) => a.id), ["praxis"]);

const svc = visibleMailAccounts(accounts, { kind: "service" });
assert.equal(svc.allowedIds, null);
assert.equal(svc.accounts.length, 3);
assert.equal(canSeeMessage(svc, { accountId: "petsas" }), true);

console.log("test-mail-visibility: ok");
