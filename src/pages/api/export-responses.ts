import type { NextApiRequest, NextApiResponse } from "next";
import { db, admin } from "~/utils/firebaseAdmin";
import { google } from "googleapis";

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
      /\\n/g,
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

// List of columns to include in the CSV
const CSV_COLUMNS = [
  "userId",
  "userName",
  "cohort",
  "userEmail",
  "allocatedLegacy",
  "sorting_group_0",
  "sorting_group_1",
  "sorting_group_2",
  "sorting_group_3",
  "sorting_group_4",
  "sorting_group_5",
  "sortingCompleted",
  "isCompleted",
  "results",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const snapshot = await db
      .collection("responses")
      .orderBy("startedAt", "desc")
      .get();

    if (snapshot.empty) {
      res.status(200).send("No data found");
      return;
    }

    // Prepare CSV headers
    let csv = CSV_COLUMNS.join(",") + "\n";

    // Gather all userIds to fetch displayNames in parallel
    const userIdToIndex: Record<string, number[]> = {};
    const docs = snapshot.docs;
    docs.forEach((doc, idx) => {
      const data = doc.data() as Record<string, unknown>;
      const userId = typeof data.userId === "string" ? data.userId : "";
      if (userId) {
        if (!userIdToIndex[userId]) userIdToIndex[userId] = [];
        userIdToIndex[userId].push(idx);
      }
    });

    // Fetch displayNames for all unique userIds, fallback to Google People API by email if not found
    const userIdList = Object.keys(userIdToIndex);
    const userIdToName: Record<string, string> = {};
    const userIdToEmail: Record<string, string> = {};

    // First, try to get displayName from Firebase Auth and cache email
    await Promise.all(
      userIdList.map(async (uid) => {
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

    // For any userId with blank name, try to fetch from Google People API using email
    await Promise.all(
      userIdList.map(async (uid) => {
        if (!userIdToName[uid] && userIdToEmail[uid]) {
          const name = await getNameFromGooglePeopleAPI(userIdToEmail[uid]);
          if (name) userIdToName[uid] = name;
        }
      }),
    );

    // Add rows
    docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const userId = typeof data.userId === "string" ? data.userId : "";
      const userName = userId ? (userIdToName[userId] ?? "") : "";
      const row = CSV_COLUMNS.map((col) => {
        let value;
        if (col === "userName") {
          // Prefer self-reported name from Firestore; fall back to Auth lookup for legacy records
          value = typeof data.userName === "string" && data.userName ? data.userName : userName;
        } else {
          value = data[col];
        }
        // Convert Firestore Timestamp to ISO string
        if (value instanceof admin.firestore.Timestamp) {
          value = value.toDate().toISOString();
        }
        // Convert objects to JSON string for CSV
        if (typeof value === "object" && value !== null) {
          value = JSON.stringify(value);
        }
        // CSV escape for commas and quotes
        if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"'))
        ) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        // Always return a string
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "boolean")
          return String(value);
        return value !== undefined && value !== null ? String(value) : "";
      }).join(",");
      csv += row + "\n";
    });

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
