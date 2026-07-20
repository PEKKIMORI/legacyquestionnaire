import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "~/utils/firebaseAdmin";
import { allocateCohort, type UserAffinity } from "~/utils/allocate";
import { verifyAdmin } from "~/utils/verifyAdmin";

type ResponseData =
  | {
      cohort: string;
      totalUsers: number;
      allocations: Record<string, number>;
      top1Rate: number;
      top3Rate: number;
      skipped: number;
    }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.message });
    return;
  }

  const { cohort } = req.body as {
    cohort?: string;
  };

  if (!cohort || typeof cohort !== "string") {
    res.status(400).json({ error: "cohort is required" });
    return;
  }

  try {
    // Fetch all completed responses for this cohort
    const snapshot = await db
      .collection("responses")
      .where("cohort", "==", cohort)
      .where("isCompleted", "==", true)
      .get();

    if (snapshot.empty) {
      res.status(200).json({
        cohort,
        totalUsers: 0,
        allocations: {},
        top1Rate: 0,
        top3Rate: 0,
        skipped: 0,
      });
      return;
    }

    // Build affinity vector for each user from their stored results
    const users: UserAffinity[] = [];
    const docIdByUserId: Record<string, string> = {};

    snapshot.docs.forEach((document) => {
      const data = document.data() as Record<string, unknown>;
      const userId = typeof data.userId === "string" ? data.userId : document.id;
      const results = data.results as Record<string, unknown> | undefined;
      const affinityVector = results?.affinityVector as
        | Partial<Record<string, number>>
        | undefined;

      if (affinityVector && typeof affinityVector === "object") {
        users.push({ userId, affinityVector });
        docIdByUserId[userId] = document.id;
      }
    });

    // Run batch allocation
    const summary = allocateCohort(users);

    // Write allocatedLegacy back to each user's Firestore doc in batches of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < summary.allocations.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = summary.allocations.slice(i, i + BATCH_SIZE);
      chunk.forEach(({ userId, allocatedLegacy }) => {
        const docId = docIdByUserId[userId];
        if (docId) {
          batch.update(db.collection("responses").doc(docId), {
            allocatedLegacy,
            allocatedAt: new Date(),
          });
        }
      });
      await batch.commit();
    }

    // Audit log: record who ran the allocation and what it produced, so
    // admins can see what changed between runs. Does not affect allocation.
    try {
      await db.collection("allocationRuns").add({
        cohort,
        runAt: new Date(),
        runBy: auth.email,
        totalCompletedResponses: users.length,
        allocated: summary.allocations.length,
        skipped: summary.skipped.length,
        legacyCounts: summary.legacyCounts,
        top1Rate: summary.top1Rate,
        top3Rate: summary.top3Rate,
      });
    } catch (logError) {
      // A failed audit write should not fail the allocation itself.
      console.error("Failed to record allocation run:", logError);
    }

    res.status(200).json({
      cohort,
      totalUsers: summary.allocations.length,
      allocations: summary.legacyCounts,
      top1Rate: summary.top1Rate,
      top3Rate: summary.top3Rate,
      skipped: summary.skipped.length,
    });
  } catch (error) {
    console.error("Allocation error:", error);
    res.status(500).json({ error: "Allocation failed" });
  }
}
