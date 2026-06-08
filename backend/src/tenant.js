import { db } from "./firebase.js";

// Tenant isolation by construction: every MAS-2 read/write goes through a
// clientId and lives under clients/{clientId}/mas_*. There is no code path that
// touches data without a clientId, so cross-tenant access is impossible.

export function clientRef(clientId) {
  const id = (clientId || "").trim();
  if (!id) throw new Error("clientId required");
  return db.collection("clients").doc(id);
}

// A MAS-owned subcollection under the tenant. We only ever use the mas_* prefix
// so we never collide with or modify existing platform collections.
export function masCollection(clientId, name) {
  if (!name.startsWith("mas_")) {
    throw new Error(`MAS-2 may only access mas_* collections, got: ${name}`);
  }
  return clientRef(clientId).collection(name);
}
