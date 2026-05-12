/**
 * Batch Legacy Allocation Algorithm
 *
 * Assigns users to legacies using a margin-based greedy approach with
 * capacity constraints, so legacy sizes across a cohort are balanced.
 *
 * Users with the highest margin (strongest single-legacy preference) are
 * assigned first, protecting those with a clear top choice. Flexible users
 * fill remaining slots.
 */

export const LEGACIES = [
  "Cable",
  "Chronicle",
  "Circuit",
  "Civic",
  "Eureka",
  "Field",
  "Gate",
  "Hunter",
  "Labyrinth",
  "Lands",
  "Laurel",
  "Legion",
  "Liberty",
  "Mason",
  "Mission",
  "North",
  "Ocean",
  "Octagon",
  "Pier",
  "Plaza",
  "Pyramid",
  "Reserve",
  "Tower",
  "Union",
  "Vista",
] as const;

export type Legacy = (typeof LEGACIES)[number];

export interface UserAffinity {
  userId: string;
  /** Full tally of points per legacy. Missing keys are treated as 0. */
  affinityVector: Partial<Record<string, number>>;
}

export interface AllocationResult {
  userId: string;
  allocatedLegacy: string;
  /** Rank of the allocated legacy in the user's preference order (1 = top choice) */
  assignedRank: number;
}

export interface AllocationSummary {
  allocations: AllocationResult[];
  /** Number of members per legacy */
  legacyCounts: Record<string, number>;
  /** % of users who got their top-1 legacy */
  top1Rate: number;
  /** % of users who got a top-3 legacy */
  top3Rate: number;
  skipped: string[];
}

/**
 * Compute capacity per legacy for N users.
 * Legacies are sorted alphabetically. The first (N % 25) legacies get
 * (floor(N/25) + 1) slots; the rest get floor(N/25).
 */
export function computeCapacities(n: number): Record<string, number> {
  const capacities: Record<string, number> = {};
  if (n === 0) {
    LEGACIES.forEach((legacy) => { capacities[legacy] = 0; });
    return capacities;
  }
  if (n <= LEGACIES.length) {
    // Fewer users than legacies — every legacy can take 1. Users fill by preference;
    // unused legacies simply end up with 0 members.
    LEGACIES.forEach((legacy) => { capacities[legacy] = 1; });
    return capacities;
  }
  const base = Math.floor(n / LEGACIES.length);
  const remainder = n % LEGACIES.length;
  LEGACIES.forEach((legacy, i) => {
    capacities[legacy] = i < remainder ? base + 1 : base;
  });
  return capacities;
}

/**
 * Sort a user's affinity vector into a ranked list, highest first.
 * Ties are broken alphabetically by legacy name (for determinism).
 */
export function rankLegacies(
  affinityVector: Partial<Record<string, number>>,
): string[] {
  return [...LEGACIES].sort((a, b) => {
    const scoreA = affinityVector[a] ?? 0;
    const scoreB = affinityVector[b] ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.localeCompare(b);
  });
}

/**
 * Compute margin: (1st place score) - (2nd place score).
 * A higher margin means a stronger preference for the top legacy.
 */
export function computeMargin(
  affinityVector: Partial<Record<string, number>>,
): number {
  const scores = LEGACIES.map((l) => affinityVector[l] ?? 0).sort(
    (a, b) => b - a,
  );
  return (scores[0] ?? 0) - (scores[1] ?? 0);
}

/**
 * Run batch allocation for a cohort.
 *
 * @param users - Array of users with their affinity vectors
 * @returns AllocationSummary with per-user results and aggregate stats
 */
export function allocateCohort(users: UserAffinity[]): AllocationSummary {
  const skipped: string[] = [];

  // Filter out users with no affinity data
  const validUsers = users.filter((u) => {
    const hasData = LEGACIES.some((l) => (u.affinityVector[l] ?? 0) > 0);
    if (!hasData) skipped.push(u.userId);
    return hasData;
  });

  const n = validUsers.length;

  if (n === 0) {
    const legacyCounts: Record<string, number> = {};
    LEGACIES.forEach((l) => (legacyCounts[l] = 0));
    return { allocations: [], legacyCounts, top1Rate: 0, top3Rate: 0, skipped };
  }

  const capacities = computeCapacities(n);
  const remaining = { ...capacities };

  // Sort users by margin descending; tiebreak by userId for determinism
  const sorted = [...validUsers].sort((a, b) => {
    const marginDiff = computeMargin(b.affinityVector) - computeMargin(a.affinityVector);
    if (marginDiff !== 0) return marginDiff;
    return a.userId.localeCompare(b.userId);
  });

  const allocations: AllocationResult[] = [];

  for (const user of sorted) {
    const ranked = rankLegacies(user.affinityVector);
    let assigned = false;

    for (let rank = 0; rank < ranked.length; rank++) {
      const legacy = ranked[rank]!;
      if ((remaining[legacy] ?? 0) > 0) {
        remaining[legacy]! -= 1;
        allocations.push({
          userId: user.userId,
          allocatedLegacy: legacy,
          assignedRank: rank + 1,
        });
        assigned = true;
        break;
      }
    }

    // Should never happen with valid capacity math, but guard anyway
    if (!assigned) {
      skipped.push(user.userId);
    }
  }

  // Build legacy counts
  const legacyCounts: Record<string, number> = {};
  LEGACIES.forEach((l) => (legacyCounts[l] = 0));
  allocations.forEach((a) => {
    legacyCounts[a.allocatedLegacy] = (legacyCounts[a.allocatedLegacy] ?? 0) + 1;
  });

  const total = allocations.length;
  const top1Rate = total > 0 ? allocations.filter((a) => a.assignedRank === 1).length / total : 0;
  const top3Rate = total > 0 ? allocations.filter((a) => a.assignedRank <= 3).length / total : 0;

  return { allocations, legacyCounts, top1Rate, top3Rate, skipped };
}
