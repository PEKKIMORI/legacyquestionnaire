import admin from "firebase-admin";

function ensureApp() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "demo-legacy-test" });
  }
}

const tokenCache = new Map<string, string>();

/**
 * Mint a Firebase ID token for `email` against the Auth emulator so integration
 * tests can exercise the real verifyAdmin() path. The user is created (or
 * updated) with a verified email; the ID token is obtained by exchanging an
 * admin-minted custom token via the emulator's REST endpoint.
 */
export async function mintIdToken(
  email: string,
  opts: { emailVerified?: boolean } = {},
): Promise<string> {
  ensureApp();
  const emailVerified = opts.emailVerified ?? true;
  const cacheKey = `${email}:${emailVerified}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) return cached;

  const auth = admin.auth();
  const uid = `test-${Buffer.from(email).toString("hex")}`;
  try {
    await auth.updateUser(uid, { email, emailVerified });
  } catch {
    await auth.createUser({ uid, email, emailVerified });
  }

  const customToken = await auth.createCustomToken(uid);
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  const resp = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = (await resp.json()) as { idToken?: string };
  if (!body.idToken) {
    throw new Error(`Failed to mint ID token: ${JSON.stringify(body)}`);
  }
  tokenCache.set(cacheKey, body.idToken);
  return body.idToken;
}

/** Default admin email used across integration tests (must be in ADMIN_EMAILS). */
export const TEST_ADMIN_EMAIL = "admin@uni.minerva.edu";

/** Authorization header carrying a valid admin ID token. */
export async function adminAuthHeader(): Promise<Record<string, string>> {
  return { authorization: `Bearer ${await mintIdToken(TEST_ADMIN_EMAIL)}` };
}

/** Authorization header for a signed-in but non-admin Minerva user. */
export async function nonAdminAuthHeader(): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await mintIdToken("intruder@uni.minerva.edu")}`,
  };
}
