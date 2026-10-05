import { buildEvent } from "../src/brain/events.js";

const base = "http://127.0.0.1:4000";
const phone = "09991112233";
const headers = {
  "content-type": "application/json",
  "x-client-id": "praxis2",
};

const created = await fetch(`${base}/brain/events`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    channel: "frontdesk",
    type: "note",
    direction: "internal",
    summary: "Teamnotiz-Probe: spricht nur Englisch.",
    counterparty: { kind: "patient", name: "Probe Fall", ref: phone },
  }),
});
const createdBody = await created.json();
const status = createdBody?.event?.status;
const id = createdBody?.event?.id;
if (!created.ok || status !== "open" || !id) {
  console.log("FAIL create", created.status, status, createdBody?.error || "");
  process.exit(1);
}

const ctx = await fetch(`${base}/brain/caller-context?phone=${phone}`, { headers });
const ctxBody = await ctx.json();
const text = String(ctxBody.context || "");
const seen = ctx.ok && ctxBody.found && text.includes("spricht nur Englisch");
if (!seen) {
  console.log("FAIL context", ctx.status, ctxBody.found, ctxBody.error || "", "ids", (ctxBody.openEventIds || []).length);
}

const closed = await fetch(`${base}/brain/events/${id}/resolve`, {
  method: "POST",
  headers,
  body: JSON.stringify({ actor: "Probe", note: "Teamnotiz-Probe aufgeraeumt" }),
});
const closedBody = await closed.json();
console.log(seen && closed.ok ? "OK" : "TEIL", "status", status, "gesehen", seen, "aufgeraeumt", closed.ok && closedBody.ok);
if (!seen || !closed.ok) process.exit(1);
