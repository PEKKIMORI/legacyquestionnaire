import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { clearFirestore } from "../helpers/firestore";
import { callApiHandler } from "../helpers/api";
import { adminAuthHeader, nonAdminAuthHeader } from "../helpers/auth";
import { seedUser, seedAllocatedCohort } from "../helpers/seed";
import { LEGACIES } from "~/utils/allocate";
import handler from "~/pages/api/export-cohort-roster";

let authHeaders: Record<string, string>;

describe("GET /api/export-cohort-roster", () => {
  beforeAll(async () => {
    authHeaders = await adminAuthHeader();
  });

  beforeEach(async () => {
    await clearFirestore();
  });

  // ── Auth tests ──────────────────────────────────────────────────────

  it("rejects request with no Authorization header with 401", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
    });
    expect(status).toBe(401);
    expect(data).toContain("Authorization");
  });

  it("rejects an invalid token with 401", async () => {
    const { status } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(status).toBe(401);
  });

  it("rejects a signed-in non-admin email with 403", async () => {
    const { status } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
      headers: await nonAdminAuthHeader(),
    });
    expect(status).toBe(403);
  });

  // ── Param validation ───────────────────────────────────────────────

  it("rejects missing cohort with 400", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: {},
      headers: authHeaders,
    });
    expect(status).toBe(400);
    expect(data).toBe("cohort query parameter is required");
  });

  // ── Empty cohort ───────────────────────────────────────────────────

  it("returns message for empty cohort", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "nonexistent" },
      headers: authHeaders,
    });
    expect(status).toBe(200);
    expect(data).toContain("No responses found");
  });

  // ── Normal roster ──────────────────────────────────────────────────

  it("returns proper CSV for 10 pre-allocated users", async () => {
    await seedAllocatedCohort({ cohort: "2029", count: 10 });

    const { status, data, headers } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/csv");
    expect(headers["content-disposition"]).toContain("cohort-2029-roster.csv");

    const csv = data as string;
    const lines = csv.trim().split("\n");

    // Header row
    expect(lines[0]).toBe(
      "Name,Email,Cohort,Gender,Country,Age,Status,Vibe,Top Legacy,Allocated Legacy,Assigned Rank,Completed At,Allocated At",
    );
    const LEGACY_COL = 9;

    // 10 data rows
    const dataRows = lines.slice(1);
    expect(dataRows.length).toBe(10);

    // Each row's legacy is valid and status is Allocated
    for (const row of dataRows) {
      const cols = row.split(",");
      expect(LEGACIES as readonly string[]).toContain(cols[LEGACY_COL]!);
      expect(cols[6]).toBe("Allocated");
    }

    // Rows should be sorted by legacy then name
    const legacyOrder = dataRows.map((r) => r.split(",")[LEGACY_COL]!);
    const sortedLegacyOrder = [...legacyOrder].sort();
    expect(legacyOrder).toEqual(sortedLegacyOrder);
  });

  // ── Demographics and derived rank ──────────────────────────────────

  it("includes demographics and the derived assigned rank", async () => {
    await seedUser({
      userId: "demo-user",
      userName: "Demo User",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10, Ocean: 5 },
      allocatedLegacy: "Ocean",
      demographics: { gender: "Woman", country: "Zimbabwe", ageRange: "18-24" },
    });

    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
      headers: authHeaders,
    });

    expect(status).toBe(200);
    const row = (data as string).trim().split("\n")[1]!;
    const cols = row.split(",");
    expect(cols[3]).toBe("Woman");
    expect(cols[4]).toBe("Zimbabwe");
    expect(cols[5]).toBe("18-24");
    // Cable scored highest but Ocean was allocated -> rank 2
    expect(cols[9]).toBe("Ocean");
    expect(cols[10]).toBe("2");
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
      query: { cohort: "2029" },
      headers: authHeaders,
    });

    expect(status).toBe(200);
    const csv = data as string;
    // The name with comma should be quoted
    expect(csv).toContain(`"O'Brien, Pat"`);
  });

  // ── Everyone appears, with status ──────────────────────────────────

  it("includes unallocated and incomplete users with their status", async () => {
    await seedUser({
      userId: "allocated-user",
      userName: "Ada Allocated",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10 },
      allocatedLegacy: "Cable",
    });
    await seedUser({
      userId: "awaiting-user",
      userName: "Amy Awaiting",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10 },
    });
    await seedUser({
      userId: "incomplete-user",
      userName: "Ian Incomplete",
      cohort: "2029",
      isCompleted: false,
      affinityVector: {},
    });

    const { data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
      headers: authHeaders,
    });

    const csv = data as string;
    const lines = csv.trim().split("\n");
    // Header + all 3 responses: nobody silently disappears
    expect(lines.length).toBe(4);
    expect(csv).toContain("Ada Allocated");
    expect(csv).toContain("Amy Awaiting");
    expect(csv).toContain("Ian Incomplete");

    const statusOf = (name: string) =>
      lines.find((l) => l.includes(name))!.split(",")[6];
    expect(statusOf("Ada Allocated")).toBe("Allocated");
    expect(statusOf("Amy Awaiting")).toBe("Awaiting allocation");
    expect(statusOf("Ian Incomplete")).toBe("Incomplete");
  });

  // ── Cohort isolation ───────────────────────────────────────────────

  it("does not include users from other cohorts", async () => {
    await seedAllocatedCohort({ cohort: "2029", count: 3, seed: 111 });
    await seedAllocatedCohort({ cohort: "2030", count: 3, seed: 222 });

    const { data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
      headers: authHeaders,
    });

    const csv = data as string;
    const dataRows = csv.trim().split("\n").slice(1);
    expect(dataRows.length).toBe(3);

    // None of the 2030 user names should appear
    expect(csv).not.toContain("allocated-2030-");
  });
});
