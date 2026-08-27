import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { clearFirestore } from "../helpers/firestore";
import { callApiHandler } from "../helpers/api";
import { adminAuthHeader, nonAdminAuthHeader } from "../helpers/auth";
import { seedUser, seedCohort } from "../helpers/seed";
import handler from "~/pages/api/export-responses";

let authHeaders: Record<string, string>;

describe("GET /api/export-responses", () => {
  beforeAll(async () => {
    authHeaders = await adminAuthHeader();
  });

  beforeEach(async () => {
    await clearFirestore();
  });

  // ── Auth tests ──────────────────────────────────────────────────────

  it("rejects request with no Authorization header with 401", async () => {
    const { status } = await callApiHandler(handler, { method: "GET" });
    expect(status).toBe(401);
  });

  it("rejects a signed-in non-admin email with 403", async () => {
    const { status } = await callApiHandler(handler, {
      method: "GET",
      headers: await nonAdminAuthHeader(),
    });
    expect(status).toBe(403);
  });

  // ── Empty collection ───────────────────────────────────────────────

  it("returns 'No data found' for empty collection", async () => {
    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      headers: authHeaders,
    });
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
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/csv");

    const csv = data as string;
    const lines = csv.trim().split("\n");

    // Header row uses human-readable column names
    const headerRow = lines[0]!;
    expect(headerRow).toContain("Name");
    expect(headerRow).toContain("Cohort");
    expect(headerRow).toContain("Allocated Legacy");
    expect(headerRow).toContain("Status");
    // Raw stored field names should not leak into a sheet people read
    expect(headerRow).not.toContain("userId");
    expect(headerRow).not.toContain("sorting_group_0");

    // Should have exactly 1 data row
    expect(lines.length).toBe(2);

    // Data row should contain our values, rendered readably
    const dataRow = lines[1]!;
    expect(dataRow).toContain("Alice Test");
    expect(dataRow).toContain("2029");
    expect(dataRow).toContain("Cable (1st choice)");
    expect(dataRow).toContain("Allocated");
  });

  // ── Multiple users ─────────────────────────────────────────────────

  it("exports CSV with 5 data rows for 5 users", async () => {
    await seedCohort({ cohort: "2029", count: 5, seed: 150 });

    const { data } = await callApiHandler(handler, {
      method: "GET",
      headers: authHeaders,
    });

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

    const { data } = await callApiHandler(handler, {
      method: "GET",
      headers: authHeaders,
    });

    const csv = data as string;
    const header = csv.split("\n")[0]!;
    const columns = header.split(",");
    expect(columns).toContain("Cohort");
    expect(columns).toContain("Allocated Legacy");
    expect(columns).toContain("Assigned Rank");
  });

  // ── Nothing is dumped as raw JSON ──────────────────────────────────

  it("renders scores, rankings and dates as readable text, not JSON", async () => {
    await seedUser({
      userId: "user-readable",
      userName: "Readable User",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 4, Chronicle: 2, Civic: 1 },
      allocatedLegacy: "Cable",
      sortingGroups: {
        0: ["Circuit", "Chronicle", "Civic", "Cable", "Eureka"],
        5: ["Professional Development", "Civic Responsibility"],
      },
    });

    const { data } = await callApiHandler(handler, {
      method: "GET",
      headers: authHeaders,
    });

    const csv = data as string;
    // No raw Firestore structures anywhere in the file
    expect(csv).not.toContain('"order":');
    expect(csv).not.toContain("_seconds");
    expect(csv).not.toContain("affinityVector");

    const cols = csv.trim().split("\n")[1]!.split(",");
    const header = csv.split("\n")[0]!.split(",");
    const col = (name: string) => cols[header.indexOf(name)]!;
    expect(col("Top 5 Legacies")).toBe("Cable (4); Chronicle (2); Civic (1)");
    expect(col("Credo Ranking 1")).toBe(
      "Circuit > Chronicle > Civic > Cable > Eureka",
    );
    expect(col("Competency Ranking")).toBe(
      "Professional Development > Civic Responsibility",
    );
    // Dates read as dates rather than ISO timestamps
    expect(col("Started At")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
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

    const { data } = await callApiHandler(handler, {
      method: "GET",
      headers: authHeaders,
    });

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

    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      headers: authHeaders,
    });

    expect(status).toBe(200);
    const csv = data as string;
    const lines = csv.trim().split("\n");
    // Should still produce a row without crashing
    expect(lines.length).toBe(2);
    expect(csv).toContain("Sparse User");
  });
});
