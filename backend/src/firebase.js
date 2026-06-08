import admin from "firebase-admin";
import { readFileSync } from "node:fs";

// Initialise firebase-admin once. Credentials come from a service-account key
// referenced by GOOGLE_APPLICATION_CREDENTIALS (preferred) — the key file is
// NEVER committed. Falls back to application-default credentials if present.
function init() {
  if (admin.apps.length) return admin.app();

  const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (credPath) {
    const serviceAccount = JSON.parse(readFileSync(credPath, "utf8"));
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  // No explicit key: rely on the ambient environment (e.g. gcloud ADC).
  return admin.initializeApp();
}

init();

export const db = admin.firestore();
export default admin;
