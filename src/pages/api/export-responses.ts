import type { NextApiRequest, NextApiResponse } from "next";
import { db, admin } from "~/utils/firebaseAdmin";
import { google } from "googleapis";
import { verifyAdmin } from "~/utils/verifyAdmin";
import {
  allocationLabel,
  csvEscape,
  formatDateTime,
  formatRanking,
  responseStatus,
  scoredChoices,
  type Affinity,
} from "~/utils/exportFormat";

// Helper to fetch user name from Google People API by email
async function getNameFromGooglePeopleAPI(email: string): Promise<string> {
  if (
    !process.env.GOOGLE_PEOPLE_API_SERVICE_ACCOUNT_EMAIL ||
    !process.env.GOOGLE_PEOPLE_API_SERVICE_ACCOUNT_PRIVATE_KEY ||
    !process.env.GOOGLE_PEOPLE_API_IMPERSONATE_USER
  ) {
    // Not configured
    return "";
  }

  // Set up JWT auth client with domain-wide delegation
  const jwtClient = new google.auth.JWT({
    email: process.env.GOOGLE_PEOPLE_API_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PEOPLE_API_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
      /\n/g,
      "\n",
    ),
    scopes: [
      "https://www.googleapis.com/auth/admin.directory.user.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    subject: process.env.GOOGLE_PEOPLE_API_IMPERSONATE_USER, // An admin user in the domain
  });

  const people = google.people({ version: "v1", auth: jwtClient });

  try {
    // Use people.searchContacts to find the contact by email
    const resp = await people.people.searchContacts({
      query: email,
      readMask: "names,emailAddresses",
      pageSize: 1,
    });
    const person = resp.data.results?.[0]?.person;
    return person?.names?.[0]?.displayName ?? "";
  } catch (e) {
    // Ignore errors, fallback to blank
  }
  return "";
}

/**
 * The credo sorting screens: groups 0-4 rank legacies, group 5 ranks Minerva's
 * core competencies. Stored per group as { order: [...], timestamp }.
 */
const LEGACY_SORTING_GROUPS = [0, 1, 2, 3, 4];
const COMPETENCY_SORTING_GROUP = 5;

const HEADER = [
  "Name",
  "Email",
  "Cohort",
  "Gender",
  "Country",
  "Age",
  "Status",
  "Vibe",
  "Vibe Legacy",
  "Allocated Legacy",
  "Assigned Rank",
  "Top 5 Legacies",
  "All Legacy Scores",
  ...LEGACY_SORTING_GROUPS.map((i) => `Credo Ranking ${i + 1}`),
  "Competency Ranking",
  "Sorting Completed",
  "Started At",
  "Completed At",
  "Allocated At",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).send(auth.message);
    return;
  }

  try {
    const snapshot = await db
      .collection("responses")
      .orderBy("startedAt", "desc")
      .get();

    if (snapshot.empty) {
      res.status(200).send("No data found");
      return;
    }

    const docs = snapshot.docs;

    // Names are self-reported on the demographics popup; older records predate
    // that, so fall back to Firebase Auth and then the Google People API.
    const userIds = Array.from(
      new Set(
        docs
          .map((doc) => (doc.data() as Record<string, unknown>).userId)
          .filter((id): id is string => typeof id === "string" && id !== ""),
      ),
    );
    const userIdToName: Record<string, string> = {};
    const userIdToEmail: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const userRecord = await admin.auth().getUser(uid);
          userIdToName[uid] = userRecord.displayName ?? "";
          userIdToEmail[uid] = userRecord.email ?? "";
        } catch (e) {
          userIdToName[uid] = "";
          userIdToEmail[uid] = "";
        }
      }),
    );
    await Promise.all(
      userIds.map(async (uid) => {
        if (!userIdToName[uid] && userIdToEmail[uid]) {
          const name = await getNameFromGooglePeopleAPI(userIdToEmail[uid]);
          if (name) userIdToName[uid] = name;
        }
      }),
    );

    const rows = docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const demographics = (data.demographics ?? {}) as Record<string, unknown>;
      const results = (data.results ?? {}) as Record<string, unknown>;
      const affinity = results.affinityVector as Affinity;

      const userId = typeof data.userId === "string" ? data.userId : "";
      const name =
        typeof data.userName === "string" && data.userName
          ? data.userName
          : (userIdToName[userId] ?? "");
      const email =
        typeof data.userEmail === "string" && data.userEmail
          ? data.userEmail
          : (userIdToEmail[userId] ?? "");
      const cohort = typeof data.cohort === "string" ? data.cohort : "";
      const allocatedLegacy =
        typeof data.allocatedLegacy === "string" ? data.allocatedLegacy : "";
      const { label, rank } = allocationLabel(allocatedLegacy, affinity);

      const cells = [
        name || "(unknown)",
        email,
        cohort,
        typeof demographics.gender === "string" ? demographics.gender : "",
        typeof demographics.country === "string" ? demographics.country : "",
        typeof demographics.age === "string"
          ? demographics.age
          : typeof demographics.ageRange === "string"
            ? demographics.ageRange
            : "",
        responseStatus(data.isCompleted === true, allocatedLegacy),
        typeof results.minervaVibe === "string" ? results.minervaVibe : "",
        typeof results.displayCategory === "string"
          ? results.displayCategory
          : "",
        label,
        rank,
        scoredChoices(affinity, 5).join("; "),
        scoredChoices(affinity).join("; "),
        ...LEGACY_SORTING_GROUPS.map((i) =>
          formatRanking(data[`sorting_group_${i}`]),
        ),
        formatRanking(data[`sorting_group_${COMPETENCY_SORTING_GROUP}`]),
        data.sortingCompleted === true ? "Yes" : "No",
        formatDateTime(data.startedAt),
        formatDateTime(data.completedAt),
        formatDateTime(data.allocatedAt),
      ];

      return { cohort, name: name || "(unknown)", cells };
    });

    // Grouped by cohort, alphabetical by name, so it reads as a roster rather
    // than in write order.
    rows.sort(
      (a, b) =>
        a.cohort.localeCompare(b.cohort) || a.name.localeCompare(b.name),
    );

    const csv =
      [
        HEADER.join(","),
        ...rows.map((r) => r.cells.map(csvEscape).join(",")),
      ].join("\n") + "\n";

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="responses.csv"',
    );
    res.status(200).send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error exporting data");
  }
}
