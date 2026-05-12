import { describe, it, expect } from "vitest";
import {
  allocateCohort,
  computeCapacities,
  rankLegacies,
  computeMargin,
  LEGACIES,
  type UserAffinity,
} from "./allocate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Generate N users with uniform random affinity vectors (25 points distributed
 * across the 25 legacies by simulating 25 random question answers).
 */
function makeUniformUsers(n: number, seed = 42): UserAffinity[] {
  const rand = makePrng(seed);
  return Array.from({ length: n }, (_, i) => {
    const affinity: Partial<Record<string, number>> = {};
    for (let q = 0; q < 25; q++) {
      const legacy = LEGACIES[Math.floor(rand() * LEGACIES.length)]!;
      affinity[legacy] = (affinity[legacy] ?? 0) + 1;
    }
    return { userId: `user-${i}`, affinityVector: affinity };
  });
}

/**
 * Generate N users where `hotLegacies` are 3x more likely to receive answers.
 */
function makeSkewedUsers(
  n: number,
  hotLegacies: string[],
  seed = 99,
): UserAffinity[] {
  const rand = makePrng(seed);
  const weights = LEGACIES.map((l) => (hotLegacies.includes(l) ? 3 : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  return Array.from({ length: n }, (_, i) => {
    const affinity: Partial<Record<string, number>> = {};
    for (let q = 0; q < 25; q++) {
      let r = rand() * totalWeight;
      let idx = 0;
      while (idx < LEGACIES.length - 1 && r > weights[idx]!) {
        r -= weights[idx]!;
        idx++;
      }
      const legacy = LEGACIES[idx]!;
      affinity[legacy] = (affinity[legacy] ?? 0) + 1;
    }
    return { userId: `user-${i}`, affinityVector: affinity };
  });
}

/** All N users prefer the same legacy with max score */
function makeMonopolyUsers(n: number, legacy: string): UserAffinity[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `user-${i}`,
    affinityVector: { [legacy]: 25 },
  }));
}

/** All N users have the exact same affinity vector */
function makeIdenticalUsers(n: number, seed = 7): UserAffinity[] {
  const [template] = makeUniformUsers(1, seed);
  return Array.from({ length: n }, (_, i) => ({
    userId: `user-${i}`,
    affinityVector: { ...template!.affinityVector },
  }));
}

/** All N users have a flat affinity (1 point per legacy) */
function makeFlatUsers(n: number): UserAffinity[] {
  const flat: Partial<Record<string, number>> = {};
  LEGACIES.forEach((l) => (flat[l] = 1));
  return Array.from({ length: n }, (_, i) => ({
    userId: `user-${i}`,
    affinityVector: { ...flat },
  }));
}

/** Users with margin >= threshold */
function highMarginCount(
  users: UserAffinity[],
  threshold: number,
): UserAffinity[] {
  return users.filter((u) => computeMargin(u.affinityVector) >= threshold);
}

// ---------------------------------------------------------------------------
// Category 1: Correctness Properties
// ---------------------------------------------------------------------------

describe("Category 1: Correctness Properties", () => {
  const cohortSizes = [100, 200, 300, 500, 1000, 2000];

  cohortSizes.forEach((n) => {
    describe(`N = ${n}`, () => {
      const users = makeUniformUsers(n);
      const result = allocateCohort(users);

      it("1.1 every user is assigned", () => {
        const assignedIds = new Set(result.allocations.map((a) => a.userId));
        expect(result.allocations.length + result.skipped.length).toBe(n);
        users.forEach((u) => {
          expect(
            assignedIds.has(u.userId) || result.skipped.includes(u.userId),
          ).toBe(true);
        });
      });

      it("1.2 every assignment is a valid legacy", () => {
        const legacySet = new Set<string>(LEGACIES);
        result.allocations.forEach((a) => {
          expect(legacySet.has(a.allocatedLegacy)).toBe(true);
        });
      });

      it("1.3 balance holds — max_size - min_size <= 1", () => {
        const counts = Object.values(result.legacyCounts);
        const max = Math.max(...counts);
        const min = Math.min(...counts);
        expect(max - min).toBeLessThanOrEqual(1);
      });

      it("1.5 no legacy exceeds capacity", () => {
        const capacities = computeCapacities(result.allocations.length);
        Object.entries(result.legacyCounts).forEach(([legacy, count]) => {
          expect(count).toBeLessThanOrEqual(capacities[legacy]!);
        });
      });

      it("1.6 determinism — same input produces same output", () => {
        const users2 = makeUniformUsers(n);
        const result2 = allocateCohort(users2);
        // Same seeded users → same allocations
        expect(result.allocations).toEqual(result2.allocations);
      });

      it("1.7 algorithm terminates in reasonable time", () => {
        const start = Date.now();
        allocateCohort(makeUniformUsers(n, 123));
        expect(Date.now() - start).toBeLessThan(5000);
      });
    });
  });

  describe("Uneven N", () => {
    [101, 199, 301, 513].forEach((n) => {
      it(`1.4 balance holds for N = ${n}`, () => {
        const result = allocateCohort(makeUniformUsers(n));
        const counts = Object.values(result.legacyCounts);
        const max = Math.max(...counts);
        const min = Math.min(...counts);
        expect(max - min).toBeLessThanOrEqual(1);

        const base = Math.floor(n / LEGACIES.length);
        const remainder = n % LEGACIES.length;
        const bigSlots = counts.filter((c) => c === base + 1).length;
        expect(bigSlots).toBe(remainder);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Category 2: Fit Quality
// ---------------------------------------------------------------------------

describe("Category 2: Fit Quality", () => {
  const cohortSizes = [100, 200, 300, 500, 1000, 2000];

  cohortSizes.forEach((n) => {
    describe(`N = ${n}`, () => {
      it("2.1 top-1 rate >= 60% (uniform random)", () => {
        const result = allocateCohort(makeUniformUsers(n));
        expect(result.top1Rate).toBeGreaterThanOrEqual(0.6);
      });

      it("2.2 top-3 rate >= 80% (uniform random)", () => {
        const result = allocateCohort(makeUniformUsers(n));
        expect(result.top3Rate).toBeGreaterThanOrEqual(0.8);
      });

      it("2.3 top-1 rate >= 20% (mild skew — 5 hot legacies)", () => {
        const hot = ["Mission", "Civic", "Tower", "Ocean", "Eureka"];
        const result = allocateCohort(makeSkewedUsers(n, hot));
        expect(result.top1Rate).toBeGreaterThanOrEqual(0.2);
      });

      it("2.4 top-3 rate >= 55% (mild skew)", () => {
        const hot = ["Mission", "Civic", "Tower", "Ocean", "Eureka"];
        const result = allocateCohort(makeSkewedUsers(n, hot));
        expect(result.top3Rate).toBeGreaterThanOrEqual(0.55);
      });

      it("2.5 high-margin users (margin >= 4) get top-1 at >= 85%", () => {
        const users = makeUniformUsers(n, 55);
        const result = allocateCohort(users);
        const highMargin = highMarginCount(users, 4);
        if (highMargin.length === 0) return; // skip if no high-margin users in this seed
        const highMarginIds = new Set(highMargin.map((u) => u.userId));
        const highMarginAllocations = result.allocations.filter((a) =>
          highMarginIds.has(a.userId),
        );
        const top1 = highMarginAllocations.filter(
          (a) => a.assignedRank === 1,
        ).length;
        expect(top1 / highMarginAllocations.length).toBeGreaterThanOrEqual(
          0.85,
        );
      });

      it("2.6 mean assigned rank <= 3.5 (uniform random)", () => {
        const result = allocateCohort(makeUniformUsers(n));
        const meanRank =
          result.allocations.reduce((sum, a) => sum + a.assignedRank, 0) /
          result.allocations.length;
        expect(meanRank).toBeLessThanOrEqual(3.5);
      });

      it("2.7 fewer than 3% of users assigned worse than top-20 (uniform random)", () => {
        const result = allocateCohort(makeUniformUsers(n));
        const badFit = result.allocations.filter((a) => a.assignedRank > 20).length;
        expect(badFit / result.allocations.length).toBeLessThan(0.03);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Category 3: Edge Cases
// ---------------------------------------------------------------------------

describe("Category 3: Edge Cases", () => {
  it("3.1a everyone picks Mission — balance holds (N=100)", () => {
    const result = allocateCohort(makeMonopolyUsers(100, "Mission"));
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(result.legacyCounts["Mission"]).toBe(4); // 100/25 = 4
  });

  it("3.1b everyone picks Mission — only capacity-many get Mission (N=500)", () => {
    const result = allocateCohort(makeMonopolyUsers(500, "Mission"));
    expect(result.legacyCounts["Mission"]).toBe(20); // 500/25 = 20
  });

  it("3.1c everyone picks Mission — no crash, all assigned", () => {
    const users = makeMonopolyUsers(100, "Mission");
    const result = allocateCohort(users);
    expect(result.allocations.length).toBe(100);
    expect(result.skipped.length).toBe(0);
  });

  it("3.2 perfect split — 100% get top-1 (N=200)", () => {
    // Exactly 8 users per legacy with no competition
    const users: UserAffinity[] = [];
    LEGACIES.forEach((legacy, li) => {
      for (let i = 0; i < 8; i++) {
        const affinity: Partial<Record<string, number>> = {};
        affinity[legacy] = 25;
        users.push({ userId: `user-${li}-${i}`, affinityVector: affinity });
      }
    });
    const result = allocateCohort(users);
    expect(result.top1Rate).toBe(1);
  });

  it("3.2 perfect split — balance holds (N=1000)", () => {
    const users: UserAffinity[] = [];
    LEGACIES.forEach((legacy, li) => {
      for (let i = 0; i < 40; i++) {
        users.push({
          userId: `user-${li}-${i}`,
          affinityVector: { [legacy]: 25 },
        });
      }
    });
    const result = allocateCohort(users);
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("3.3 two-legacy pileup — balance holds (N=100)", () => {
    const half = 50;
    const usersA = makeMonopolyUsers(half, "Mission");
    const usersB = makeMonopolyUsers(half, "Civic").map((u) => ({
      ...u,
      userId: `b-${u.userId}`,
    }));
    const result = allocateCohort([...usersA, ...usersB]);
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("3.3 two-legacy pileup — high-margin users get priority for the two legacies (N=500)", () => {
    // Users with highest affinity for Mission/Civic should get them first
    const usersA = makeMonopolyUsers(250, "Mission");
    const usersB = makeMonopolyUsers(250, "Civic").map((u) => ({
      ...u,
      userId: `b-${u.userId}`,
    }));
    const result = allocateCohort([...usersA, ...usersB]);
    expect(result.legacyCounts["Mission"]).toBe(20);
    expect(result.legacyCounts["Civic"]).toBe(20);
  });

  it("3.4 all users identical — balance holds, no crash (N=100)", () => {
    const result = allocateCohort(makeIdenticalUsers(100));
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(result.allocations.length).toBe(100);
  });

  it("3.4 all users identical — balance holds, no crash (N=300)", () => {
    const result = allocateCohort(makeIdenticalUsers(300));
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("3.5 flat affinity — balance holds, no crash (N=200)", () => {
    const result = allocateCohort(makeFlatUsers(200));
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(result.allocations.length).toBe(200);
  });

  it("3.6 25 dominant users each clearly prefer a distinct legacy (N=500)", () => {
    const dominantUsers: UserAffinity[] = LEGACIES.map((legacy, i) => ({
      userId: `dominant-${i}`,
      affinityVector: { [legacy]: 25 },
    }));
    const rest = makeUniformUsers(475, 11).map((u) => ({
      ...u,
      userId: `rest-${u.userId}`,
    }));
    const result = allocateCohort([...dominantUsers, ...rest]);
    // Each dominant user should get their legacy (they have max margin)
    dominantUsers.forEach((u, i) => {
      const assignment = result.allocations.find((a) => a.userId === u.userId);
      expect(assignment?.allocatedLegacy).toBe(LEGACIES[i]);
      expect(assignment?.assignedRank).toBe(1);
    });
    // Balance still holds
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("3.7 minimum viable cohort N=25 — one member per legacy", () => {
    const users: UserAffinity[] = LEGACIES.map((legacy, i) => ({
      userId: `user-${i}`,
      affinityVector: { [legacy]: 25 },
    }));
    const result = allocateCohort(users);
    Object.values(result.legacyCounts).forEach((count) => {
      expect(count).toBe(1);
    });
  });

  it("3.8 tiny cohort N=10 — 10 legacies get 1, 15 get 0, no crash", () => {
    const users = makeUniformUsers(10, 22);
    const result = allocateCohort(users);
    expect(result.allocations.length).toBe(10);
    const counts = Object.values(result.legacyCounts);
    expect(counts.filter((c) => c === 1).length).toBe(10);
    expect(counts.filter((c) => c === 0).length).toBe(15);
  });

  it("3.9 single user — gets top-1 legacy", () => {
    const users: UserAffinity[] = [
      { userId: "solo", affinityVector: { Mission: 10, Civic: 5, Tower: 3 } },
    ];
    const result = allocateCohort(users);
    expect(result.allocations[0]?.allocatedLegacy).toBe("Mission");
    expect(result.allocations[0]?.assignedRank).toBe(1);
  });

  it("3.10 large skew small cohort (80% same legacy) — balance holds, no crash (N=100)", () => {
    const users = [
      ...makeMonopolyUsers(80, "Mission"),
      ...makeUniformUsers(20, 77).map((u) => ({
        ...u,
        userId: `rest-${u.userId}`,
      })),
    ];
    const result = allocateCohort(users);
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(result.allocations.length).toBe(100);
  });

  it("3.11a adversarial margins — high-margin users spread across legacies get top-1 at >= 90% (N=500)", () => {
    // 250 strong users: 10 per legacy, each clearly preferring a distinct legacy (score 20).
    // 250 flat users with margin 0 compete for remaining slots.
    // Strong users have high margin and should be assigned first.
    const rand = makePrng(44);
    const strongHalf: UserAffinity[] = [];
    LEGACIES.forEach((legacy, li) => {
      for (let i = 0; i < 10; i++) {
        // Each strong user has score 20 for their legacy, noise across others
        const affinity: Partial<Record<string, number>> = { [legacy]: 20 };
        LEGACIES.forEach((other) => {
          if (other !== legacy) affinity[other] = Math.floor(rand() * 2);
        });
        strongHalf.push({ userId: `strong-${li}-${i}`, affinityVector: affinity });
      }
    });
    const flatHalf = makeFlatUsers(250).map((u) => ({
      ...u,
      userId: `flat-${u.userId}`,
    }));
    const result = allocateCohort([...strongHalf, ...flatHalf]);

    const strongIds = new Set(strongHalf.map((u) => u.userId));
    const strongAllocations = result.allocations.filter((a) =>
      strongIds.has(a.userId),
    );
    const top1 = strongAllocations.filter((a) => a.assignedRank === 1).length;
    expect(top1 / strongAllocations.length).toBeGreaterThanOrEqual(0.9);
  });

  it("3.11b tie-break for zero-margin users is stable — no crash", () => {
    const users = [...makeFlatUsers(250), ...makeFlatUsers(250).map((u) => ({ ...u, userId: `b-${u.userId}` }))];
    expect(() => allocateCohort(users)).not.toThrow();
    const result = allocateCohort(users);
    expect(result.allocations.length).toBe(500);
  });

  it("3.12a non-divisible N=101 — max-min <= 1", () => {
    const result = allocateCohort(makeUniformUsers(101));
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("3.12b non-divisible N=99 — max-min <= 1", () => {
    const result = allocateCohort(makeUniformUsers(99));
    const counts = Object.values(result.legacyCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("3.12c non-divisible N=137 — correct remainder distribution", () => {
    const result = allocateCohort(makeUniformUsers(137));
    const base = Math.floor(137 / 25); // 5
    const remainder = 137 % 25; // 12
    const counts = Object.values(result.legacyCounts);
    expect(counts.filter((c) => c === base + 1).length).toBe(remainder);
    expect(counts.filter((c) => c === base).length).toBe(25 - remainder);
  });

  it("3.12d non-divisible N=251 — correct remainder distribution", () => {
    const result = allocateCohort(makeUniformUsers(251));
    const base = Math.floor(251 / 25); // 10
    const remainder = 251 % 25; // 1
    const counts = Object.values(result.legacyCounts);
    expect(counts.filter((c) => c === base + 1).length).toBe(remainder);
    expect(counts.filter((c) => c === base).length).toBe(25 - remainder);
  });

  it("empty input — returns empty allocations without crashing", () => {
    const result = allocateCohort([]);
    expect(result.allocations).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.top1Rate).toBe(0);
    expect(result.top3Rate).toBe(0);
  });

  it("users with empty affinity vectors are skipped", () => {
    const users: UserAffinity[] = [
      { userId: "empty", affinityVector: {} },
      { userId: "real", affinityVector: { Mission: 10 } },
    ];
    const result = allocateCohort(users);
    expect(result.skipped).toContain("empty");
    expect(result.allocations.find((a) => a.userId === "real")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Category 4: Performance
// ---------------------------------------------------------------------------

describe("Category 4: Performance", () => {
  it("4.1 N=100 completes in < 100ms", () => {
    const users = makeUniformUsers(100);
    const start = Date.now();
    allocateCohort(users);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("4.2 N=500 completes in < 500ms", () => {
    const users = makeUniformUsers(500);
    const start = Date.now();
    allocateCohort(users);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("4.3 N=1000 completes in < 1000ms", () => {
    const users = makeUniformUsers(1000);
    const start = Date.now();
    allocateCohort(users);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("4.4 N=2000 completes in < 2000ms", () => {
    const users = makeUniformUsers(2000);
    const start = Date.now();
    allocateCohort(users);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("4.5 N=2000 worst-case (all identical) completes in < 5000ms", () => {
    const users = makeIdenticalUsers(2000);
    const start = Date.now();
    allocateCohort(users);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});

// ---------------------------------------------------------------------------
// Unit tests for helper functions
// ---------------------------------------------------------------------------

describe("computeCapacities", () => {
  it("even N — all legacies get exactly base slots", () => {
    const caps = computeCapacities(100);
    Object.values(caps).forEach((c) => expect(c).toBe(4));
  });

  it("uneven N — correct number of legacies get base+1", () => {
    const caps = computeCapacities(101);
    const big = Object.values(caps).filter((c) => c === 5).length;
    expect(big).toBe(1); // 101 % 25 = 1
  });

  it("N=0 — all capacities are 0", () => {
    const caps = computeCapacities(0);
    Object.values(caps).forEach((c) => expect(c).toBe(0));
  });
});

describe("computeMargin", () => {
  it("clear winner — margin equals difference", () => {
    expect(computeMargin({ Mission: 10, Civic: 4 })).toBe(6);
  });

  it("perfect tie — margin is 0", () => {
    expect(computeMargin({ Mission: 5, Civic: 5 })).toBe(0);
  });

  it("single legacy — margin equals that score", () => {
    expect(computeMargin({ Mission: 7 })).toBe(7);
  });

  it("empty vector — margin is 0", () => {
    expect(computeMargin({})).toBe(0);
  });
});

describe("rankLegacies", () => {
  it("returns highest-score legacy first", () => {
    const ranked = rankLegacies({ Mission: 10, Civic: 5, Tower: 1 });
    expect(ranked[0]).toBe("Mission");
  });

  it("tie-breaks alphabetically", () => {
    const ranked = rankLegacies({ Civic: 5, Mission: 5 });
    expect(ranked[0]).toBe("Civic"); // Civic < Mission alphabetically
  });

  it("includes all 25 legacies", () => {
    expect(rankLegacies({})).toHaveLength(25);
  });

  it("missing legacies get score 0 and appear at end", () => {
    const ranked = rankLegacies({ Mission: 1 });
    expect(ranked[0]).toBe("Mission");
    expect(ranked.slice(1).every((l) => l !== "Mission")).toBe(true);
  });
});
