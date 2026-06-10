import admin from "firebase-admin";
import { readFileSync } from "node:fs";

// Initialise firebase-admin once. Credentials come from a service-account key
// referenced by GOOGLE_APPLICATION_CREDENTIALS (preferred) — the key file is
// NEVER committed. Falls back to application-default credentials if present.
function init() {
  if (admin.apps.length) return admin.app();

  const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  const bucketEnv = (process.env.FIREBASE_STORAGE_BUCKET || "").trim();
  if (credPath) {
    const serviceAccount = JSON.parse(readFileSync(credPath, "utf8"));
    // A storage bucket is REQUIRED for mail attachments (and letter archiving)
    // larger than the inline Firestore cap. Default to the project's standard
    // bucket; override with FIREBASE_STORAGE_BUCKET when it differs.
    const storageBucket = bucketEnv || (serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      ...(storageBucket ? { storageBucket } : {}),
    });
  }
  // No explicit key: rely on the ambient environment (e.g. gcloud ADC).
  return admin.initializeApp(bucketEnv ? { storageBucket: bucketEnv } : undefined);
}

init();

export const db = admin.firestore();
export default admin;
