import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "~/utils/firebaseAdmin";
import { rankLegacies } from "~/utils/allocate";
import { verifyAdmin } from "~/utils/verifyAdmin";
import { credoPositionsFromResponse } from "~/utils/credo";

export interface OverviewUser {
  name: string;
  email: string;
  status: "Incomplete" | "Awaiting allocation" | "Allocated";
  vibe: string;
  topLegacies: { legacy: string; score: number }[];
  allocatedLegacy: string;
  assignedRank: number | null;
}

export interface AllocationRun {
  runAt: string;
  runBy: string;
  allocated: number;
  skipped: number;
  top1Rate: number;
  top3Rate: number;
}

export interface CohortOverview {
  cohort: string;
  counts: {
    total: number;
    complete: number;
    incomplete: number;
    allocated: number;
    awaiting: number;
  };
  legacyCounts: Record<string, number>;
  top1Rate: number;
  top3Rate: number;
  /** Allocated members with score data — the denominator for the rates above */
  rankedCount: number;
  top1Count: number;
  top3Count: number;
  users: OverviewUser[];
  runs: AllocationRun[];
}

function toIso(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CohortOverview | { error: string }>,
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.message });
    return;
  }

  const { cohort } = req.query;
  if (!cohort || typeof cohort !== "string") {
    res.status(400).json({ error: "cohort query parameter is required" });
    return;
  }

  try {
    const [responsesSnap, runsSnap] = await Promise.all([
      db.collection("responses").where("cohort", "==", cohort).get(),
      db.collection("allocationRuns").where("cohort", "==", cohort).get(),
    ]);

    const users: OverviewUser[] = [];
    const legacyCounts: Record<string, number> = {};
    let complete = 0;
    let allocated = 0;
    let rankedCount = 0;
    let top1 = 0;
    let top3 = 0;

    responsesSnap.docs.forEach((document) => {
      const data = document.data() as Record<string, unknown>;
      const results = (data.results ?? {}) as Record<string, unknown>;
      const isCompleted = data.isCompleted === true;
      const allocatedLegacy =
        typeof data.allocatedLegacy === "string" ? data.allocatedLegacy : "";

      if (isCompleted) complete++;
      if (allocatedLegacy) {
        allocated++;
        legacyCounts[allocatedLegacy] = (legacyCounts[allocatedLegacy] ?? 0) + 1;
      }

      const affinityVector = results.affinityVector as
        | Partial<Record<string, number>>
        | undefined;

      let topLegacies: { legacy: string; score: number }[] = [];
      let assignedRank: number | null = null;
      if (affinityVector) {
        const ranked = rankLegacies(
          affinityVector,
          credoPositionsFromResponse(data),
        );
        topLegacies = ranked.slice(0, 3).map((legacy) => ({
          legacy,
          score: affinityVector[legacy] ?? 0,
        }));
        if (allocatedLegacy) {
          const idx = ranked.indexOf(allocatedLegacy);
          if (idx >= 0) {
            assignedRank = idx + 1;
            rankedCount++;
            if (assignedRank === 1) top1++;
            if (assignedRank <= 3) top3++;
          }
        }
      }

      users.push({
        name: typeof data.userName === "string" ? data.userName : "(unknown)",
        email: typeof data.userEmail === "string" ? data.userEmail : "",
        status: !isCompleted
          ? "Incomplete"
          : allocatedLegacy
            ? "Allocated"
            : "Awaiting allocation",
        vibe: typeof results.minervaVibe === "string" ? results.minervaVibe : "",
        topLegacies,
        allocatedLegacy,
        assignedRank,
      });
    });

    users.sort((a, b) => a.name.localeCompare(b.name));

    // Sorted in memory (rather than orderBy) to avoid needing a composite
    // Firestore index for cohort+runAt.
    const runs: AllocationRun[] = runsSnap.docs
      .map((document) => {
        const data = document.data() as Record<string, unknown>;
        return {
          runAt: toIso(data.runAt),
          runBy: typeof data.runBy === "string" ? data.runBy : "",
          allocated: typeof data.allocated === "number" ? data.allocated : 0,
          skipped: typeof data.skipped === "number" ? data.skipped : 0,
          top1Rate: typeof data.top1Rate === "number" ? data.top1Rate : 0,
          top3Rate: typeof data.top3Rate === "number" ? data.top3Rate : 0,
        };
      })
      .sort((a, b) => b.runAt.localeCompare(a.runAt))
      .slice(0, 20);

    res.status(200).json({
      cohort,
      counts: {
        total: responsesSnap.size,
        complete,
        incomplete: responsesSnap.size - complete,
        allocated,
        awaiting: complete - allocated,
      },
      legacyCounts,
      top1Rate: rankedCount > 0 ? top1 / rankedCount : 0,
      top3Rate: rankedCount > 0 ? top3 / rankedCount : 0,
      rankedCount,
      top1Count: top1,
      top3Count: top3,
      users,
      runs,
    });
  } catch (error) {
    console.error("Overview error:", error);
    res.status(500).json({ error: "Failed to load cohort overview" });
  }
}
