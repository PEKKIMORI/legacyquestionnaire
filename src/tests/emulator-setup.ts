// Must set env vars BEFORE any Firebase imports
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-legacy-test";
process.env.FIREBASE_PROJECT_ID = "demo-legacy-test";
process.env.ADMIN_API_SECRET = "test-secret-for-emulator";
// Prevent Google People API calls during tests
delete process.env.GOOGLE_PEOPLE_API_SERVICE_ACCOUNT_EMAIL;
delete process.env.GOOGLE_PEOPLE_API_SERVICE_ACCOUNT_PRIVATE_KEY;
delete process.env.GOOGLE_PEOPLE_API_IMPERSONATE_USER;
