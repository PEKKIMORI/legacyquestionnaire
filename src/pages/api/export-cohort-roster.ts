import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "~/utils/firebaseAdmin";
import { rankLegacies } from "~/utils/allocate";
import { verifyAdmin } from "~/utils/verifyAdmin";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd" */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatTimestamp(value: unknown): string {
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
    // Every response for the cohort is exported — incomplete and
    // not-yet-allocated people included — so the CSV row count always matches
    // the true response count and nobody silently disappears.
    const snapshot = await db
      .collection("responses")
      .where("cohort", "==", cohort)
      .get();

    if (snapshot.empty) {
      res.status(200).send("No responses found for this cohort");
      return;
    }

    interface Row {
      name: string;
      email: string;
      cohort: string;
      gender: string;
      country: string;
      age: string;
      status: string;
      vibe: string;
      topLegacy: string;
      /** 2nd–5th ranked legacies, e.g. "Ocean (5)"; blank past their scored legacies */
      runnerUps: string[];
      /** Raw legacy name, used for grouping rows */
      allocatedLegacy: string;
      /** Legacy annotated with where it sat in their own ranking */
      allocatedLabel: string;
      assignedRank: string;
      completedAt: string;
      allocatedAt: string;
    }

    const rows: Row[] = snapshot.docs.map((document) => {
      const data = document.data() as Record<string, unknown>;
      const demographics = (data.demographics ?? {}) as Record<string, unknown>;
      const results = (data.results ?? {}) as Record<string, unknown>;

      const isCompleted = data.isCompleted === true;
      const allocatedLegacy =
        typeof data.allocatedLegacy === "string" ? data.allocatedLegacy : "";
      const status = !isCompleted
        ? "Incomplete"
        : allocatedLegacy
          ? "Allocated"
          : "Awaiting allocation";

      const affinityVector = results.affinityVector as
        | Partial<Record<string, number>>
        | undefined;
      const ranked = affinityVector ? rankLegacies(affinityVector) : [];
      const scoreOf = (legacy: string) => affinityVector?.[legacy] ?? 0;

      // Runner-up choices (ranks 2-5). Only legacies the person actually
      // scored points in are listed: past that, rankLegacies is just breaking
      // ties alphabetically between zeros, which would imply a preference
      // that does not exist.
      const runnerUps = [1, 2, 3, 4].map((i) => {
        const legacy = ranked[i];
        if (!legacy) return "";
        const score = scoreOf(legacy);
        return score > 0 ? `${legacy} (${score})` : "";
      });

      // Where the allocated legacy sat in their own preference order
      // (1 = their top-scored legacy), so admins can see when balancing
      // placed someone outside their top choice. A legacy they scored zero
      // points in is reported as unranked rather than given a rank number.
      let allocatedLabel = allocatedLegacy;
      let assignedRank = "";
      if (allocatedLegacy && affinityVector) {
        const rank = ranked.indexOf(allocatedLegacy);
        if (rank >= 0 && scoreOf(allocatedLegacy) > 0) {
          assignedRank = String(rank + 1);
          allocatedLabel = `${allocatedLegacy} (${ordinal(rank + 1)} choice)`;
        } else {
          allocatedLabel = `${allocatedLegacy} (unranked)`;
        }
      }

      return {
        name: typeof data.userName === "string" ? data.userName : "(unknown)",
        email: typeof data.userEmail === "string" ? data.userEmail : "",
        cohort: typeof data.cohort === "string" ? data.cohort : "",
        gender: typeof demographics.gender === "string" ? demographics.gender : "",
        country:
          typeof demographics.country === "string" ? demographics.country : "",
        age:
          typeof demographics.age === "string"
            ? demographics.age
            : typeof demographics.ageRange === "string"
              ? demographics.ageRange
              : "",
        status,
        vibe: typeof results.minervaVibe === "string" ? results.minervaVibe : "",
        topLegacy:
          typeof results.displayCategory === "string"
            ? results.displayCategory
            : "",
        runnerUps,
        allocatedLegacy,
        allocatedLabel,
        assignedRank,
        completedAt: formatTimestamp(data.completedAt),
        allocatedAt: formatTimestamp(data.allocatedAt),
      };
    });

    // Allocated members grouped by legacy first, then awaiting, then
    // incomplete; alphabetical by name within each group.
    const statusOrder: Record<string, number> = {
      Allocated: 0,
      "Awaiting allocation": 1,
      Incomplete: 2,
    };
    rows.sort((a, b) => {
      const statusDiff =
        (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      if (statusDiff !== 0) return statusDiff;
      const legacyDiff = a.allocatedLegacy.localeCompare(b.allocatedLegacy);
      if (legacyDiff !== 0) return legacyDiff;
      return a.name.localeCompare(b.name);
    });

    const header = [
      "Name",
      "Email",
      "Cohort",
      "Gender",
      "Country",
      "Age",
      "Status",
      "Vibe",
      "Top Legacy",
      "2nd Choice",
      "3rd Choice",
      "4th Choice",
      "5th Choice",
      "Allocated Legacy",
      "Assigned Rank",
      "Completed At",
      "Allocated At",
    ];
    const lines = [header.join(",")];
    rows.forEach((row) => {
      lines.push(
        [
          row.name,
          row.email,
          row.cohort,
          row.gender,
          row.country,
          row.age,
          row.status,
          row.vibe,
          row.topLegacy,
          ...row.runnerUps,
          row.allocatedLabel,
          row.assignedRank,
          row.completedAt,
          row.allocatedAt,
        ]
          .map(csvEscape)
          .join(","),
      );
    });
    const csv = lines.join("\n") + "\n";

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
