import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "~/utils/firebaseAdmin";
import { LEGACIES } from "~/utils/allocate";
import { verifyAdmin } from "~/utils/verifyAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).send(auth.message);
    return;
  }

  const { cohort } = req.query;
  if (!cohort || typeof cohort !== "string") {
    res.status(400).send("cohort query parameter is required");
    return;
  }

  try {
    const snapshot = await db
      .collection("responses")
      .where("cohort", "==", cohort)
      .where("isCompleted", "==", true)
      .get();

    if (snapshot.empty) {
      res.status(200).send("No completed responses found for this cohort");
      return;
    }

    // Collect rows grouped by allocated legacy
    const byLegacy: Record<string, string[]> = {};
    LEGACIES.forEach((l) => (byLegacy[l] = []));

    snapshot.docs.forEach((document) => {
      const data = document.data() as Record<string, unknown>;
      const name = typeof data.userName === "string" ? data.userName : "(unknown)";
      const legacy = typeof data.allocatedLegacy === "string" ? data.allocatedLegacy : null;

      if (legacy && byLegacy[legacy] !== undefined) {
        byLegacy[legacy].push(name);
      }
    });

    // Build CSV sorted by legacy name, then alphabetically by member name within each legacy
    let csv = "Legacy,Name\n";
    LEGACIES.forEach((legacy) => {
      const members = (byLegacy[legacy] ?? []).sort((a, b) => a.localeCompare(b));
      members.forEach((name) => {
        const safeName = name.includes(",") || name.includes('"')
          ? `"${name.replace(/"/g, '""')}"`
          : name;
        csv += `${legacy},${safeName}\n`;
      });
    });

    // Sanitize cohort for use in filename (allow only alphanumeric and hyphens)
    const safeCohort = cohort.replace(/[^a-zA-Z0-9-]/g, "");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cohort-${safeCohort}-roster.csv"`,
    );
    res.status(200).send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error exporting roster");
  }
}
