# Batch Legacy Allocation Algorithm — Test Specification

## Definitions

- **N** = cohort size
- **Affinity vector** = a user's tally of points across all 25 legacies (sums to 25)
- **Top-k legacy** = the legacy ranked k-th in a user's affinity vector
- **Margin** = difference between a user's 1st and 2nd highest affinity scores
- **Balance property** = `max_legacy_size - min_legacy_size <= 1`

## Cohort Size Reference

| Cohort Size | base (N/25) | remainder (N%25) | Per-legacy capacity |
|---|---|---|---|
| 100 | 4 | 0 | exactly 4 each |
| 200 | 8 | 0 | exactly 8 each |
| 300 | 12 | 0 | exactly 12 each |
| 500 | 20 | 0 | exactly 20 each |
| 1000 | 40 | 0 | exactly 40 each |
| 2000 | 80 | 0 | exactly 80 each |

---

## Category 1: Correctness Properties

Run for ALL 6 cohort sizes (100, 200, 300, 500, 1000, 2000). Hard requirements — any failure is a bug.

| # | Test Name | Input | Pass Condition |
|---|---|---|---|
| 1.1 | Every user assigned | Any input | `len(assignments) == N`, every user appears exactly once |
| 1.2 | Every assignment is a valid legacy | Any input | All 25 legacy names are the only values in output |
| 1.3 | Balance holds (even N) | N = 100, 200, 300, 500, 1000, 2000 | Every legacy has exactly `N/25` members |
| 1.4 | Balance holds (uneven N) | N = 101, 199, 301, 513 | `max_size - min_size <= 1`, and exactly `N%25` legacies have `floor(N/25)+1` |
| 1.5 | No legacy exceeds capacity | Any input | No legacy has more than `ceil(N/25)` members |
| 1.6 | Determinism | Same input twice | Identical output both times |
| 1.7 | Algorithm terminates | Any input | Returns within reasonable time (< 5s for N=2000) |

**7 tests x 6 cohort sizes = 42 test runs, plus 4 additional for uneven sizes = 46 total.**

---

## Category 2: Fit Quality

Run for ALL 6 cohort sizes. Soft requirements — we define acceptable thresholds.

| # | Test Name | Input Distribution | Pass Condition |
|---|---|---|---|
| 2.1 | Top-1 rate (uniform random) | Each user's answers drawn uniformly from all 25 legacies | >= 60% of users get their top-1 legacy |
| 2.2 | Top-3 rate (uniform random) | Same as above | >= 90% of users get a top-3 legacy |
| 2.3 | Top-1 rate (mild skew) | 5 legacies are 3x more likely to appear in answers | >= 45% get top-1 |
| 2.4 | Top-3 rate (mild skew) | Same as above | >= 80% get top-3 |
| 2.5 | High-margin users protected | Users with margin >= 4 (out of 25 questions) | >= 85% of high-margin users get their top-1 |
| 2.6 | Mean rank of assignment | Uniform random | Average assigned legacy rank <= 2.0 (1 = top choice) |
| 2.7 | Worst-case rank | Uniform random | No user assigned worse than their top-8 legacy |

**7 tests x 6 sizes = 42 test runs.**

---

## Category 3: Edge Cases

| # | Test Name | Input | Cohort Size | Pass Condition |
|---|---|---|---|---|
| 3.1 | Everyone picks same legacy | All N users have legacy "Mission" as top-1 with score 25 | 100, 500 | Balance holds. Only `N/25` users get Mission. Rest get next-best. No crash. |
| 3.2 | Perfect split | Exactly `N/25` users prefer each legacy (no conflicts) | 200, 1000 | 100% of users get their top-1 |
| 3.3 | Two-legacy pileup | 50% of users prefer Legacy A, 50% prefer Legacy B | 100, 500 | Balance holds. Users in A/B with highest margin get priority for those slots |
| 3.4 | All users identical | Every user has the exact same affinity vector | 100, 300 | Balance holds. Algorithm doesn't crash or infinite-loop. Assignments are arbitrary but valid |
| 3.5 | All users have flat affinity | Every user scored 1 point in each of 25 legacies (all ties) | 200 | Balance holds. Assignment is arbitrary but valid. No crash. |
| 3.6 | Single user per legacy dominates | 25 users have score=25 for one legacy each, rest are uniform | 500 | Those 25 users each get their legacy. Balance still holds for the rest. |
| 3.7 | Minimum viable cohort | N = 25 (one slot per legacy) | 25 | Every legacy gets exactly 1 member. Fit is best-effort. |
| 3.8 | Tiny cohort | N = 10 (fewer users than legacies) | 10 | 10 legacies get 1 member, 15 get 0. No crash. Each user gets best available. |
| 3.9 | One user | N = 1 | 1 | User gets their top-1 legacy. |
| 3.10 | Large skew, small cohort | 80% of users prefer same legacy | 100 | Balance holds. Top-1 rate will be low but algorithm doesn't break. |
| 3.11 | Adversarial margins | Half the users have margin=0 (perfect tie), half have margin=10 | 500 | High-margin users get top-1 at >= 90%. Tie-break for zero-margin is stable (no crash). |
| 3.12 | Non-divisible cohort sizes | N = 101, 99, 137, 251 | varies | Balance property: `max - min <= 1`. Correct remainder distribution. |

**12 edge case tests (~18 test runs across multiple sizes).**

---

## Category 4: Performance

| # | Test Name | Input | Pass Condition |
|---|---|---|---|
| 4.1 | N=100 completes fast | Uniform random | < 100ms |
| 4.2 | N=500 completes fast | Uniform random | < 500ms |
| 4.3 | N=1000 completes fast | Uniform random | < 1s |
| 4.4 | N=2000 completes fast | Uniform random | < 2s |
| 4.5 | N=2000 worst-case (all same preference) | All users identical | < 5s |

**5 test runs.**

---

## Totals

| Category | Unique Tests | Test Runs |
|---|---|---|
| Correctness | 7 | 46 |
| Fit Quality | 7 | 42 |
| Edge Cases | 12 | ~18 |
| Performance | 5 | 5 |
| **Total** | **31** | **~111** |

---

## Notes on Fit Quality Thresholds

The percentages (60% top-1, 90% top-3 for uniform) are conservative estimates. With uniform random preferences across 25 legacies and only 25 questions, most users won't have a strong single-legacy signal — so 60% top-1 is realistic. Under skew conditions the thresholds drop because many users compete for few legacies. These thresholds can be recalibrated after the first implementation run.
