import admin from "firebase-admin";
import { LEGACIES } from "~/utils/allocate";

/** Simple seeded PRNG (mulberry32) for reproducible random inputs */
function makePrng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getDb(): FirebaseFirestore.Firestore {
  return admin.firestore();
}

/** Create a single response doc in the emulator Firestore */
export async function seedUser(params: {
  userId: string;
  userName: string;
  cohort: string;
  isCompleted: boolean;
  affinityVector: Partial<Record<string, number>>;
  allocatedLegacy?: string;
  demographics?: { gender: string; country: string; ageRange: string };
}): Promise<string> {
  const db = getDb();
  const docRef = db.collection("responses").doc(params.userId);

  const doc: Record<string, unknown> = {
    userId: params.userId,
    userName: params.userName,
    cohort: params.cohort,
    isCompleted: params.isCompleted,
    results: {
      displayCategory: "Cable",
      affinityVector: params.affinityVector,
    },
    startedAt: admin.firestore.Timestamp.now(),
    demographics: params.demographics ?? {
      gender: "Prefer not to say",
      country: "US",
      ageRange: "18-24",
    },
  };

  if (params.allocatedLegacy) {
    doc.allocatedLegacy = params.allocatedLegacy;
    doc.allocatedAt = admin.firestore.Timestamp.now();
  }

  await docRef.set(doc);
  return params.userId;
}

/** Generate a random affinity vector using the seeded PRNG */
function randomAffinityVector(
  rand: () => number,
): Partial<Record<string, number>> {
  const affinity: Partial<Record<string, number>> = {};
  for (let q = 0; q < 25; q++) {
    const legacy = LEGACIES[Math.floor(rand() * LEGACIES.length)]!;
    affinity[legacy] = (affinity[legacy] ?? 0) + 1;
  }
  return affinity;
}

/** Create N users for a cohort with randomized affinity vectors */
export async function seedCohort(params: {
  cohort: string;
  count: number;
  seed?: number;
  affinityGenerator?: (index: number) => Partial<Record<string, number>>;
}): Promise<string[]> {
  const db = getDb();
  const rand = makePrng(params.seed ?? 42);
  const userIds: string[] = [];

  // Write in batches of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < params.count; i += BATCH_SIZE) {
    const batch = db.batch();
    const end = Math.min(i + BATCH_SIZE, params.count);

    for (let j = i; j < end; j++) {
      const userId = `user-${params.cohort}-${j}`;
      userIds.push(userId);
      const docRef = db.collection("responses").doc(userId);

      const affinityVector = params.affinityGenerator
        ? params.affinityGenerator(j)
        : randomAffinityVector(rand);

      batch.set(docRef, {
        userId,
        userName: `Test User ${j}`,
        cohort: params.cohort,
        isCompleted: true,
        results: {
          displayCategory: "Cable",
          affinityVector,
        },
        startedAt: admin.firestore.Timestamp.now(),
        demographics: {
          gender: "Prefer not to say",
          country: "US",
          ageRange: "18-24",
        },
      });
    }

    await batch.commit();
  }

  return userIds;
}

/** Create N users who already have allocatedLegacy set (for testing roster export) */
export async function seedAllocatedCohort(params: {
  cohort: string;
  count: number;
  seed?: number;
}): Promise<string[]> {
  const db = getDb();
  const rand = makePrng(params.seed ?? 77);
  const userIds: string[] = [];

  const BATCH_SIZE = 500;
  for (let i = 0; i < params.count; i += BATCH_SIZE) {
    const batch = db.batch();
    const end = Math.min(i + BATCH_SIZE, params.count);

    for (let j = i; j < end; j++) {
      const userId = `allocated-${params.cohort}-${j}`;
      userIds.push(userId);
      const docRef = db.collection("responses").doc(userId);

      const legacy = LEGACIES[j % LEGACIES.length]!;

      batch.set(docRef, {
        userId,
        userName: `Allocated User ${j}`,
        cohort: params.cohort,
        isCompleted: true,
        results: {
          displayCategory: legacy,
          affinityVector: randomAffinityVector(rand),
        },
        allocatedLegacy: legacy,
        allocatedAt: admin.firestore.Timestamp.now(),
        startedAt: admin.firestore.Timestamp.now(),
        demographics: {
          gender: "Prefer not to say",
          country: "US",
          ageRange: "18-24",
        },
      });
    }

    await batch.commit();
  }

  return userIds;
}
