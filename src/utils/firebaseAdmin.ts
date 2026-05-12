import admin from "firebase-admin";

if (!admin.apps.length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Use service account JSON file pointed to by GOOGLE_APPLICATION_CREDENTIALS
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } else if (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    process.env.NODE_ENV === "development"
  ) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
}

export const db = admin.firestore();
export { admin };
