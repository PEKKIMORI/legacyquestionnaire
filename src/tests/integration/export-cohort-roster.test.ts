import { describe, it, expect, beforeEach } from "vitest";
import { clearFirestore } from "../helpers/firestore";
import { callApiHandler } from "../helpers/api";
import { seedUser, seedAllocatedCohort } from "../helpers/seed";
import { LEGACIES } from "~/utils/allocate";
import handler from "~/pages/api/export-cohort-roster";

const SECRET = "test-secret-for-emulator";

describe("GET /api/export-cohort-roster", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  // ── Auth tests ──────────────────────────────────────────────────────

  it("rejects missing adminSecret with 401", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
    });
    expect(status).toBe(401);
    expect(data).toBe("Unauthorized");
  });

  it("rejects wrong adminSecret with 401", async () => {
    const { status } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029", adminSecret: "wrong" },
    });
    expect(status).toBe(401);
  });

  // ── Param validation ───────────────────────────────────────────────

  it("rejects missing cohort with 400", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { adminSecret: SECRET },
    });
    expect(status).toBe(400);
    expect(data).toBe("cohort query parameter is required");
  });

  // ── Empty cohort ───────────────────────────────────────────────────

  it("returns message for empty cohort", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "nonexistent", adminSecret: SECRET },
    });
    expect(status).toBe(200);
    expect(data).toContain("No completed responses found");
  });

  // ── Normal roster ──────────────────────────────────────────────────

  it("returns proper CSV for 10 pre-allocated users", async () => {
    await seedAllocatedCohort({ cohort: "2029", count: 10 });

    const { status, data, headers } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/csv");
    expect(headers["content-disposition"]).toContain("cohort-2029-roster.csv");

    const csv = data as string;
    const lines = csv.trim().split("\n");

    // Header row
    expect(lines[0]).toBe("Legacy,Name");

    // 10 data rows
    const dataRows = lines.slice(1);
    expect(dataRows.length).toBe(10);

    // Each row's legacy is valid
    for (const row of dataRows) {
      const legacy = row.split(",")[0]!;
      expect(LEGACIES as readonly string[]).toContain(legacy);
    }

    // Rows should be sorted by legacy then name
    const legacyOrder = dataRows.map((r) => r.split(",")[0]!);
    const sortedLegacyOrder = [...legacyOrder].sort();
    expect(legacyOrder).toEqual(sortedLegacyOrder);
  });

  // ── CSV escaping ───────────────────────────────────────────────────

  it("properly escapes commas and quotes in names", async () => {
    await seedUser({
      userId: "comma-user",
      userName: `O'Brien, Pat`,
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10 },
      allocatedLegacy: "Cable",
    });

    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029", adminSecret: SECRET },
    });

    expect(status).toBe(200);
    const csv = data as string;
    // The name with comma should be quoted
    expect(csv).toContain(`"O'Brien, Pat"`);
  });

  // ── Unallocated users excluded ─────────────────────────────────────

  it("excludes users without allocatedLegacy", async () => {
    await seedUser({
      userId: "allocated-user",
      userName: "Allocated",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10 },
      allocatedLegacy: "Cable",
    });
    await seedUser({
      userId: "unallocated-user",
      userName: "Not Allocated",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10 },
    });

    const { data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029", adminSecret: SECRET },
    });

    const csv = data as string;
    const lines = csv.trim().split("\n");
    // Header + 1 data row (only the allocated user)
    expect(lines.length).toBe(2);
    expect(csv).toContain("Allocated");
    expect(csv).not.toContain("Not Allocated");
  });

  // ── Cohort isolation ───────────────────────────────────────────────

  it("does not include users from other cohorts", async () => {
    await seedAllocatedCohort({ cohort: "2029", count: 3, seed: 111 });
    await seedAllocatedCohort({ cohort: "2030", count: 3, seed: 222 });

    const { data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029", adminSecret: SECRET },
    });

    const csv = data as string;
    const dataRows = csv.trim().split("\n").slice(1);
    expect(dataRows.length).toBe(3);

    // None of the 2030 user names should appear
    expect(csv).not.toContain("allocated-2030-");
  });
});
