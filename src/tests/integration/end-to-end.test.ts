import { describe, it, expect, beforeEach } from "vitest";
import admin from "firebase-admin";
import { clearFirestore } from "../helpers/firestore";
import { callApiHandler } from "../helpers/api";
import { seedCohort } from "../helpers/seed";
import allocateHandler from "~/pages/api/allocate-cohort";
import rosterHandler from "~/pages/api/export-cohort-roster";
import exportHandler from "~/pages/api/export-responses";

const SECRET = "test-secret-for-emulator";

function getDb() {
  return admin.firestore();
}

describe("Cross-endpoint integration", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  // ── Full flow: allocate → roster ────────────────────────────────────

  it("allocate then export roster for 50 users", async () => {
    const userIds = await seedCohort({ cohort: "2029", count: 50, seed: 900 });

    // Allocate
    const { status: allocStatus, data: allocData } = await callApiHandler(
      allocateHandler,
      {
        method: "POST",
        body: { cohort: "2029", adminSecret: SECRET },
      },
    );
    expect(allocStatus).toBe(200);
    const alloc = allocData as Record<string, unknown>;
    expect(alloc.totalUsers).toBe(50);

    // Export roster
    const { status: rosterStatus, data: rosterData } = await callApiHandler(
      rosterHandler,
      {
        method: "GET",
        query: { cohort: "2029", adminSecret: SECRET },
      },
    );
    expect(rosterStatus).toBe(200);

    const csv = rosterData as string;
    const lines = csv.trim().split("\n");
    const dataRows = lines.slice(1);

    // 50 users should appear in roster
    expect(dataRows.length).toBe(50);

    // Legacy distribution in roster matches allocate-cohort response
    const rosterCounts: Record<string, number> = {};
    for (const row of dataRows) {
      const legacy = row.split(",")[0]!;
      rosterCounts[legacy] = (rosterCounts[legacy] ?? 0) + 1;
    }

    const apiAllocations = alloc.allocations as Record<string, number>;
    for (const [legacy, count] of Object.entries(apiAllocations)) {
      if (count > 0) {
        expect(rosterCounts[legacy]).toBe(count);
      }
    }
  });

  // ── Full flow: allocate → export responses ─────────────────────────

  it("allocate then export responses shows allocatedLegacy column", async () => {
    await seedCohort({ cohort: "2029", count: 10, seed: 910 });

    // Allocate
    const { status: allocStatus } = await callApiHandler(allocateHandler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });
    expect(allocStatus).toBe(200);

    // Export all responses
    const { status: exportStatus, data: exportData } = await callApiHandler(
      exportHandler,
      { method: "GET" },
    );
    expect(exportStatus).toBe(200);

    const csv = exportData as string;
    const lines = csv.trim().split("\n");
    const header = lines[0]!;
    const allocLegacyIdx = header.split(",").indexOf("allocatedLegacy");
    expect(allocLegacyIdx).toBeGreaterThan(-1);

    // Every data row should have a non-empty allocatedLegacy value
    const dataRows = lines.slice(1);
    expect(dataRows.length).toBe(10);
    for (const row of dataRows) {
      const cols = row.split(",");
      expect(cols[allocLegacyIdx]).toBeTruthy();
    }
  });

  // ── Re-allocation updates Firestore ─────────────────────────────────

  it("re-allocation with changed affinities produces new results", async () => {
    const userIds = await seedCohort({ cohort: "2029", count: 10, seed: 920 });

    // First allocation
    const { status: s1, data: d1 } = await callApiHandler(allocateHandler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });
    expect(s1).toBe(200);

    // Record first allocation results
    const db = getDb();
    const firstAllocations: Record<string, string> = {};
    for (const uid of userIds) {
      const doc = await db.collection("responses").doc(uid).get();
      firstAllocations[uid] = doc.data()!.allocatedLegacy as string;
    }

    // Change affinity vectors to strongly prefer different legacies
    for (let i = 0; i < userIds.length; i++) {
      const uid = userIds[i]!;
      // Shift everyone's preference to a different legacy
      const newLegacyIndex = (i + 5) % 25;
      const legacyName =
        [
          "Cable", "Chronicle", "Circuit", "Civic", "Eureka",
          "Field", "Gate", "Hunter", "Labyrinth", "Lands",
          "Laurel", "Legion", "Liberty", "Mason", "Mission",
          "North", "Ocean", "Octagon", "Pier", "Plaza",
          "Pyramid", "Reserve", "Tower", "Union", "Vista",
        ][newLegacyIndex]!;

      await db.collection("responses").doc(uid).update({
        "results.affinityVector": { [legacyName]: 25 },
      });
    }

    // Re-allocate
    const { status: s2, data: d2 } = await callApiHandler(allocateHandler, {
      method: "POST",
      body: { cohort: "2029", adminSecret: SECRET },
    });
    expect(s2).toBe(200);
    expect((d2 as Record<string, unknown>).totalUsers).toBe(10);

    // Verify Firestore has new values
    const secondAllocations: Record<string, string> = {};
    for (const uid of userIds) {
      const doc = await db.collection("responses").doc(uid).get();
      secondAllocations[uid] = doc.data()!.allocatedLegacy as string;
    }

    // At least some allocations should have changed (with such drastically
    // different affinities, most or all should differ)
    let changed = 0;
    for (const uid of userIds) {
      if (firstAllocations[uid] !== secondAllocations[uid]) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});
