import { describe, it, expect, beforeEach } from "vitest";
import { clearFirestore } from "../helpers/firestore";
import { callApiHandler } from "../helpers/api";
import { seedUser, seedCohort } from "../helpers/seed";
import handler from "~/pages/api/export-responses";

describe("GET /api/export-responses", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  // ── Empty collection ───────────────────────────────────────────────

  it("returns 'No data found' for empty collection", async () => {
    const { status, data } = await callApiHandler(handler, { method: "GET" });
    expect(status).toBe(200);
    expect(data).toBe("No data found");
  });

  // ── Single user ────────────────────────────────────────────────────

  it("exports CSV with correct columns for a single user", async () => {
    await seedUser({
      userId: "user-1",
      userName: "Alice Test",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10, Chronicle: 5 },
      allocatedLegacy: "Cable",
    });

    const { status, data, headers } = await callApiHandler(handler, {
      method: "GET",
    });

    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/csv");

    const csv = data as string;
    const lines = csv.trim().split("\n");

    // Header row should contain expected columns
    const headerRow = lines[0]!;
    expect(headerRow).toContain("userId");
    expect(headerRow).toContain("userName");
    expect(headerRow).toContain("cohort");
    expect(headerRow).toContain("allocatedLegacy");
    expect(headerRow).toContain("isCompleted");

    // Should have exactly 1 data row
    expect(lines.length).toBe(2);

    // Data row should contain our values
    const dataRow = lines[1]!;
    expect(dataRow).toContain("user-1");
    expect(dataRow).toContain("2029");
  });

  // ── Multiple users ─────────────────────────────────────────────────

  it("exports CSV with 5 data rows for 5 users", async () => {
    await seedCohort({ cohort: "2029", count: 5, seed: 150 });

    const { data } = await callApiHandler(handler, { method: "GET" });

    const csv = data as string;
    const lines = csv.trim().split("\n");
    // Header + 5 data rows
    expect(lines.length).toBe(6);
  });

  // ── Contains cohort and allocatedLegacy columns ────────────────────

  it("CSV includes cohort and allocatedLegacy columns", async () => {
    await seedUser({
      userId: "user-cols",
      userName: "Col Test",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 5 },
      allocatedLegacy: "Cable",
    });

    const { data } = await callApiHandler(handler, { method: "GET" });

    const csv = data as string;
    const header = csv.split("\n")[0]!;
    const columns = header.split(",");
    expect(columns).toContain("cohort");
    expect(columns).toContain("allocatedLegacy");
  });

  // ── userName prefers self-reported ─────────────────────────────────

  it("uses self-reported userName from Firestore doc", async () => {
    await seedUser({
      userId: "user-name-test",
      userName: "Self Reported Name",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 5 },
    });

    const { data } = await callApiHandler(handler, { method: "GET" });

    const csv = data as string;
    expect(csv).toContain("Self Reported Name");
  });

  // ── Handles missing optional fields ────────────────────────────────

  it("handles missing allocatedLegacy and other optional fields", async () => {
    await seedUser({
      userId: "user-sparse",
      userName: "Sparse User",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 5 },
      // no allocatedLegacy
    });

    const { status, data } = await callApiHandler(handler, { method: "GET" });

    expect(status).toBe(200);
    const csv = data as string;
    const lines = csv.trim().split("\n");
    // Should still produce a row without crashing
    expect(lines.length).toBe(2);
    expect(csv).toContain("Sparse User");
  });
});
