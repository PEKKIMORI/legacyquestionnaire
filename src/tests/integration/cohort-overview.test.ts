import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { clearFirestore } from "../helpers/firestore";
import { callApiHandler } from "../helpers/api";
import { adminAuthHeader, nonAdminAuthHeader } from "../helpers/auth";
import { seedUser, seedCohort } from "../helpers/seed";
import handler from "~/pages/api/cohort-overview";
import allocateHandler from "~/pages/api/allocate-cohort";
import type { CohortOverview } from "~/pages/api/cohort-overview";

let authHeaders: Record<string, string>;

describe("GET /api/cohort-overview", () => {
  beforeAll(async () => {
    authHeaders = await adminAuthHeader();
  });

  beforeEach(async () => {
    await clearFirestore();
  });

  // ── Auth tests ──────────────────────────────────────────────────────

  it("rejects request with no Authorization header with 401", async () => {
    const { status } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
    });
    expect(status).toBe(401);
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
    const { status } = await callApiHandler(handler, {
      method: "GET",
      query: {},
      headers: authHeaders,
    });
    expect(status).toBe(400);
  });

  // ── Overview shape ─────────────────────────────────────────────────

  it("reports counts, per-user rows, and derived ranks for a mixed cohort", async () => {
    await seedUser({
      userId: "allocated-top",
      userName: "Ada Top",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10, Ocean: 5 },
      allocatedLegacy: "Cable",
    });
    await seedUser({
      userId: "allocated-second",
      userName: "Beth Second",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Cable: 10, Ocean: 5 },
      allocatedLegacy: "Ocean",
    });
    await seedUser({
      userId: "awaiting",
      userName: "Cara Awaiting",
      cohort: "2029",
      isCompleted: true,
      affinityVector: { Gate: 7 },
    });
    await seedUser({
      userId: "incomplete",
      userName: "Dan Incomplete",
      cohort: "2029",
      isCompleted: false,
      affinityVector: {},
    });

    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
      headers: authHeaders,
    });

    expect(status).toBe(200);
    const overview = data as CohortOverview;

    expect(overview.counts).toEqual({
      total: 4,
      complete: 3,
      incomplete: 1,
      allocated: 2,
      awaiting: 1,
    });
    expect(overview.legacyCounts).toEqual({ Cable: 1, Ocean: 1 });
    // One of two allocated got their top legacy; both within top 3
    expect(overview.top1Rate).toBeCloseTo(0.5);
    expect(overview.top3Rate).toBeCloseTo(1);
    // Raw counts back the percentages shown on the dashboard
    expect(overview.rankedCount).toBe(2);
    expect(overview.top1Count).toBe(1);
    expect(overview.top3Count).toBe(2);

    // Users sorted by name
    expect(overview.users.map((u) => u.name)).toEqual([
      "Ada Top",
      "Beth Second",
      "Cara Awaiting",
      "Dan Incomplete",
    ]);

    const ada = overview.users[0]!;
    expect(ada.status).toBe("Allocated");
    expect(ada.assignedRank).toBe(1);
    expect(ada.topLegacies[0]).toEqual({ legacy: "Cable", score: 10 });

    const beth = overview.users[1]!;
    expect(beth.assignedRank).toBe(2);

    const cara = overview.users[2]!;
    expect(cara.status).toBe("Awaiting allocation");
    expect(cara.assignedRank).toBeNull();

    const dan = overview.users[3]!;
    expect(dan.status).toBe("Incomplete");

    // No allocation has been run through the API, so no runs logged
    expect(overview.runs).toEqual([]);
  });

  // ── Audit log round-trip ───────────────────────────────────────────

  it("shows an allocation run in history after running allocation", async () => {
    await seedCohort({ cohort: "2029", count: 10, seed: 700 });

    const { status: allocStatus } = await callApiHandler(allocateHandler, {
      method: "POST",
      body: { cohort: "2029" },
      headers: authHeaders,
    });
    expect(allocStatus).toBe(200);

    const { status, data } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2029" },
      headers: authHeaders,
    });

    expect(status).toBe(200);
    const overview = data as CohortOverview;

    expect(overview.runs.length).toBe(1);
    const run = overview.runs[0]!;
    expect(run.allocated).toBe(10);
    expect(run.runBy).toBeTruthy();
    expect(run.runAt).toBeTruthy();

    // Runs are isolated per cohort
    const { data: otherData } = await callApiHandler(handler, {
      method: "GET",
      query: { cohort: "2030" },
      headers: authHeaders,
    });
    expect((otherData as CohortOverview).runs).toEqual([]);
  });
});
