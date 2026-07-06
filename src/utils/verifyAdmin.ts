import type { NextApiRequest } from "next";
import { admin } from "~/utils/firebaseAdmin";

export type AdminAuthResult =
  | { ok: true; email: string; uid: string }
  | { ok: false; status: number; message: string };

/**
 * Admin allowlist, sourced from the ADMIN_EMAILS env var (comma-separated).
 * Emails are compared case-insensitively. Fails closed: if the list is empty,
 * no one is treated as an admin.
 */
function getAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifies that the request comes from a signed-in Firebase user whose verified
 * email is on the admin allowlist. Expects an `Authorization: Bearer <idToken>`
 * header carrying a Firebase ID token obtained via the client SDK.
 *
 * This is the only real protection on the admin API routes — the client-side
 * "secret page" gate does not protect these endpoints from direct requests.
 */
export async function verifyAdmin(req: NextApiRequest): Promise<AdminAuthResult> {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return {
      ok: false,
      status: 401,
      message: "Missing or malformed Authorization header. Please sign in.",
    };
  }

  const idToken = match[1]!;
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    return {
      ok: false,
      status: 401,
      message: "Invalid or expired sign-in token. Please sign in again.",
    };
  }

  const email = decoded.email?.toLowerCase();
  if (!email || !decoded.email_verified) {
    return {
      ok: false,
      status: 403,
      message: "Your account does not have a verified email.",
    };
  }

  const allowlist = getAllowlist();
  if (allowlist.length === 0) {
    // Misconfiguration — refuse rather than allow everyone.
    return {
      ok: false,
      status: 500,
      message: "Admin allowlist is not configured.",
    };
  }

  if (!allowlist.includes(email)) {
    return {
      ok: false,
      status: 403,
      message: "Your account is not authorized for admin actions.",
    };
  }

  return { ok: true, email, uid: decoded.uid };
}
