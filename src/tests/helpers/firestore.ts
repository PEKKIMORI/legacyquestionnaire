import admin from "firebase-admin";

/** Get the Firestore instance (uses the emulator via FIRESTORE_EMULATOR_HOST env var) */
export function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "demo-legacy-test" });
  }
  return admin.firestore();
}

/** Clear all Firestore data in the emulator */
export async function clearFirestore(): Promise<void> {
  const response = await fetch(
    "http://127.0.0.1:8080/emulator/v1/projects/demo-legacy-test/databases/(default)/documents",
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Failed to clear Firestore emulator: ${response.status}`);
  }
}
