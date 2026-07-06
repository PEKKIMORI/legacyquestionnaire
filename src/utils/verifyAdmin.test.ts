import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextApiRequest } from "next";

// Mock the Firebase Admin wrapper so we can control verifyIdToken().
const verifyIdToken = vi.fn();
vi.mock("~/utils/firebaseAdmin", () => ({
  admin: { auth: () => ({ verifyIdToken }) },
  db: {},
}));

import { verifyAdmin } from "./verifyAdmin";

function reqWith(authorization?: string): NextApiRequest {
  return { headers: authorization ? { authorization } : {} } as NextApiRequest;
}

describe("verifyAdmin", () => {
  const ORIG = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    verifyIdToken.mockReset();
    process.env.ADMIN_EMAILS = "admin@uni.minerva.edu, Boss@Minerva.edu";
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = ORIG;
  });

  it("rejects a missing Authorization header with 401", async () => {
    const result = await verifyAdmin(reqWith());
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header with 401", async () => {
    const result = await verifyAdmin(reqWith("Basic abc123"));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects an invalid/expired token with 401", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired"));
    const result = await verifyAdmin(reqWith("Bearer bad-token"));
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a token with an unverified email with 403", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "u1",
      email: "admin@uni.minerva.edu",
      email_verified: false,
    });
    const result = await verifyAdmin(reqWith("Bearer t"));
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects a verified email that is not on the allowlist with 403", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "u2",
      email: "random@uni.minerva.edu",
      email_verified: true,
    });
    const result = await verifyAdmin(reqWith("Bearer t"));
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed with 500 when ADMIN_EMAILS is unset", async () => {
    delete process.env.ADMIN_EMAILS;
    verifyIdToken.mockResolvedValue({
      uid: "u3",
      email: "admin@uni.minerva.edu",
      email_verified: true,
    });
    const result = await verifyAdmin(reqWith("Bearer t"));
    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  it("accepts an allowlisted, verified admin (case-insensitive)", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "u4",
      email: "ADMIN@uni.minerva.edu",
      email_verified: true,
    });
    const result = await verifyAdmin(reqWith("Bearer good"));
    expect(result).toEqual({
      ok: true,
      email: "admin@uni.minerva.edu",
      uid: "u4",
    });
  });

  it("matches allowlist entries case-insensitively with surrounding spaces", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "u5",
      email: "boss@minerva.edu",
      email_verified: true,
    });
    const result = await verifyAdmin(reqWith("Bearer good"));
    expect(result).toMatchObject({ ok: true, uid: "u5" });
  });
});
