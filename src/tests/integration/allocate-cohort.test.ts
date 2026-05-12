import { describe, it, expect, beforeEach } from "vitest";
import admin from "firebase-admin";
import { clearFirestore } from "../helpers/firestore";
import { callApiHandler } from "../helpers/api";
import { seedUser, seedCohort } from "../helpers/seed";
import { LEGACIES } from "~/utils/allocate";
import handler from "~/pages/api/allocate-cohort";

const SECRET = "test-secret-for-emulator";

function getDb() {
  return admin.firestore();
}

describe("POST /api/allocate-cohort", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  // ── Auth tests ──────────────────────────────────────────────────────

  it("rejects missing adminSecret with 401", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029" },
    });
    expect(status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("rejects wrong adminSecret with 401", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: "wrong-secret" },
    });
    expect(status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("rejects when ADMIN_API_SECRET env is empty string", async () => {
    const orig = process.env.ADMIN_API_SECRET;
    process.env.ADMIN_API_SECRET = "";
    try {
      const { status } = await callApiHandler(handler, {
        method: "POST",
        body: { cohort: "2029", adminSecret: "" },
      });
      expect(status).toBe(401);
    } finally {
      process.env.ADMIN_API_SECRET = orig;
    }
  });

  // ── Method / param validation ────────────────────────────────────────

  it("rejects GET with 405", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029", adminSecret: SECRET },
    });
    expect(status).toBe(405);
    expect(data).toEqual({ error: "Method not allowed" });
  });

  it("rejects POST without cohort with 400", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { adminSecret: SECRET },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: "cohort is required" });
  });

  // ── Empty cohort ────────────────────────────────────────────────────

  it("returns totalUsers 0 for empty cohort", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "nonexistent", adminSecret: SECRET },
    });
    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.totalUsers).toBe(0);
    expect(d.allocations).toEqual({});
  });

  // ── Small cohort (5 users) ──────────────────────────────────────────

  it("allocates 5 users correctly", async () => {
    const userIds = await seedCohort({ cohort: "2029", count: 5, seed: 100 });

    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.totalUsers).toBe(5);

    const allocations = d.allocations as Record<string, number>;
    const total = Object.values(allocations).reduce((a, b) => a + b, 0);
    expect(total).toBe(5);

    // Every allocated legacy must be valid
    for (const legacy of Object.keys(allocations)) {
      if (allocations[legacy]! > 0) {
        expect(LEGACIES as readonly string[]).toContain(legacy);
      }
    }

    // Verify Firestore docs updated
    const db = getDb();
    for (const uid of userIds) {
      const doc = await db.collection("responses").doc(uid).get();
      const docData = doc.data()!;
      expect(docData.allocatedLegacy).toBeDefined();
      expect(typeof docData.allocatedLegacy).toBe("string");
      expect(LEGACIES as readonly string[]).toContain(docData.allocatedLegacy);
      expect(docData.allocatedAt).toBeDefined();
    }
  });

  // ── Standard cohort (75 users) ─────────────────────────────────────

  it("allocates 75 users with balanced distribution", async () => {
    const userIds = await seedCohort({ cohort: "2029", count: 75, seed: 200 });

    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.totalUsers).toBe(75);

    const allocations = d.allocations as Record<string, number>;
    const total = Object.values(allocations).reduce((a, b) => a + b, 0);
    expect(total).toBe(75);

    // Balance: ceil(75/25) = 3
    const maxPerLegacy = Math.ceil(75 / 25);
    for (const [legacy, count] of Object.entries(allocations)) {
      expect(count).toBeLessThanOrEqual(maxPerLegacy);
    }

    // Verify Firestore matches API response
    const db = getDb();
    const firestoreCounts: Record<string, number> = {};
    for (const uid of userIds) {
      const doc = await db.collection("responses").doc(uid).get();
      const legacy = doc.data()!.allocatedLegacy as string;
      firestoreCounts[legacy] = (firestoreCounts[legacy] ?? 0) + 1;
    }
    for (const [legacy, count] of Object.entries(allocations)) {
      if (count > 0) {
        expect(firestoreCounts[legacy]).toBe(count);
      }
    }
  });

  // ── Large cohort (501 users — tests batch writes) ──────────────────

  it("allocates 501 users across batch boundaries", async () => {
    const userIds = await seedCohort({ cohort: "2029", count: 501, seed: 300 });

    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.totalUsers).toBe(501);

    // Verify all docs updated in Firestore
    const db = getDb();
    let updatedCount = 0;
    for (const uid of userIds) {
      const doc = await db.collection("responses").doc(uid).get();
      if (doc.data()!.allocatedLegacy) updatedCount++;
    }
    expect(updatedCount).toBe(501);
  });

  // ── Skips incomplete users ─────────────────────────────────────────

  it("skips users with isCompleted=false", async () => {
    // 10 complete users
    await seedCohort({ cohort: "2029", count: 10, seed: 400 });

    // 5 incomplete users
    for (let i = 0; i < 5; i++) {
      await seedUser({
        userId: `incomplete-${i}`,
        userName: `Incomplete ${i}`,
        cohort: "2029",
        isCompleted: false,
        affinityVector: { Cable: 10, Chronicle: 5 },
      });
    }

    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.totalUsers).toBe(10);

    // Verify incomplete docs NOT updated
    const db = getDb();
    for (let i = 0; i < 5; i++) {
      const doc = await db.collection("responses").doc(`incomplete-${i}`).get();
      expect(doc.data()!.allocatedLegacy).toBeUndefined();
    }
  });

  // ── Skips users without affinityVector ─────────────────────────────

  it("skips users with missing or empty affinityVector", async () => {
    // 3 valid users
    await seedCohort({ cohort: "2029", count: 3, seed: 500 });

    // User with empty affinityVector (all zeros)
    await seedUser({
      userId: "empty-affinity",
      userName: "Empty Affinity",
      cohort: "2029",
      isCompleted: true,
      affinityVector: {},
    });

    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    // 3 valid + 1 skipped = totalUsers 3 (skipped not counted in totalUsers)
    expect(d.totalUsers).toBe(3);
    expect(d.skipped).toBe(1);
  });

  // ── Cohort isolation ───────────────────────────────────────────────

  it("only allocates the specified cohort", async () => {
    await seedCohort({ cohort: "2029", count: 5, seed: 600 });
    await seedCohort({ cohort: "2030", count: 5, seed: 601 });

    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);
    expect((data as Record<string, unknown>).totalUsers).toBe(5);

    // Verify "2030" docs untouched
    const db = getDb();
    for (let i = 0; i < 5; i++) {
      const doc = await db.collection("responses").doc(`user-2030-${i}`).get();
      expect(doc.data()!.allocatedLegacy).toBeUndefined();
    }
  });

  // ── Idempotency ────────────────────────────────────────────────────

  it("re-allocation overwrites previous results", async () => {
    await seedCohort({ cohort: "2029", count: 10, seed: 700 });

    // First allocation
    const { status: s1 } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });
    expect(s1).toBe(200);

    // Second allocation
    const { status: s2, data: d2 } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });
    expect(s2).toBe(200);
    expect((d2 as Record<string, unknown>).totalUsers).toBe(10);
  });

  // ── top1Rate and top3Rate plausibility ─────────────────────────────

  it("top1Rate > 0 and top3Rate >= top1Rate with random affinities", async () => {
    await seedCohort({ cohort: "2029", count: 50, seed: 800 });

    const { data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });

    const d = data as Record<string, unknown>;
    expect(d.top1Rate).toBeGreaterThan(0);
    expect(d.top3Rate).toBeGreaterThanOrEqual(d.top1Rate as number);
  });

  // ── Hand-crafted affinity correctness ──────────────────────────────

  it("assigns users to expected legacies with hand-crafted affinities", async () => {
    // User A: strongly prefers Cable
    await seedUser({
      userId: "user-a",
      userName: "User A",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 20, Chronicle: 1, Circuit: 1 },
    });

    // User B: strongly prefers Chronicle
    await seedUser({
      userId: "user-b",
      userName: "User B",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Chronicle: 20, Cable: 1, Circuit: 1 },
    });

    // User C: strongly prefers Circuit
    await seedUser({
      userId: "user-c",
      userName: "User C",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Circuit: 20, Cable: 1, Chronicle: 1 },
    });

    const { status, data } = await callApiHandler(handler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);

    const db = getDb();
    const docA = await db.collection("responses").doc("user-a").get();
    const docB = await db.collection("responses").doc("user-b").get();
    const docC = await db.collection("responses").doc("user-c").get();

    expect(docA.data()!.allocatedLegacy).toBe("Cable");
    expect(docB.data()!.allocatedLegacy).toBe("Chronicle");
    expect(docC.data()!.allocatedLegacy).toBe("Circuit");
  });
});
