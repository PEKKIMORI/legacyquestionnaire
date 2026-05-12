# Batch Legacy Allocation — Implementation Plan

## Overview

Replace the current per-user "highest tally wins" allocation with a batch allocation algorithm that balances legacy sizes across each cohort while maximizing individual fit. Allocations are computed on-demand (allocation day), not at form submission time.

---

## Changes

### 1. Add Name and Cohort Fields to the Questionnaire

**Before the vibe quiz begins**, present a form asking the user for:

- **Full name** (text input, required)
- **Cohort** (dropdown: Class of 2028, 2029, 2030, etc., required)

Store these as top-level fields in the user's Firestore `responses` document:

```typescript
{
  userName: "Alice Smith",
  cohort: "2029",
  // ...existing fields (q1_CR, sorting_group_0, etc.)
}
```

This replaces the current approach of fetching names from Firebase Auth / Google People API — the user self-reports their name.

### 2. Store Full Affinity Vector

Currently, `Final.tsx` computes the tally and only stores the winning legacy. Change this to **store the full affinity vector** alongside the result:

```typescript
{
  results: {
    vibe: "Purpose",           // still shown to user (random sub-attribute)
    legacy: "Mission",         // naive top-1 (shown to user as immediate feedback)
    affinityVector: {          // NEW: full tally, used by batch allocation
      Mission: 7,
      Civic: 6,
      Tower: 3,
      // ...all 25 legacies
    }
  }
}
```

The `legacy` field here is the naive assignment shown to the user at quiz completion. The **actual** allocation happens later via batch.

### 3. Batch Allocation Algorithm (new API endpoint)

Create `src/pages/api/allocate-cohort.ts`:

**Input:** cohort identifier (e.g., `"2029"`)

**Algorithm:**

1. Fetch all completed responses for the given cohort from Firestore
2. Extract each user's affinity vector
3. Compute capacity per legacy: `base = floor(N / 25)`, `remainder = N % 25`. First `remainder` legacies (alphabetical) get `base + 1` slots, rest get `base`
4. Sort users by **margin** (1st place score minus 2nd place score) in descending order — high-margin users are assigned first because they have the most to lose
5. Greedy assignment: for each user in sorted order, assign them to their highest-affinity legacy that still has capacity
6. Write the `allocatedLegacy` field back to each user's Firestore document

**Output:** JSON summary of the allocation (counts per legacy, fit statistics)

### 4. Update Existing CSV Export

Add `userName`, `cohort`, and `allocatedLegacy` columns to the existing detailed CSV at `/api/export-responses`. The `userName` field now comes from the Firestore document (self-reported) rather than Firebase Auth lookups. Keep all existing columns.

Updated `CSV_COLUMNS`:

```typescript
const CSV_COLUMNS = [
  "userId",
  "userName",       // now self-reported, stored in Firestore
  "cohort",         // NEW
  "userEmail",
  "allocatedLegacy", // NEW: result of batch allocation
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
```

### 5. New Simple CSV Export (per-cohort roster)

Create `src/pages/api/export-cohort-roster.ts`:

**Input:** query param `?cohort=2029`

**Output:** A simple CSV with two columns:

```csv
Name,Legacy
Alice Smith,Mission
Bob Jones,Civic
Carol Lee,Eureka
...
```

Rows are sorted by legacy name (so all Cable members are grouped, then all Chronicle members, etc.), making it easy for admins to read off members per legacy.

This endpoint is accessed from the admin/super-secret page alongside the existing export button.

### 6. Admin UI Updates

On the admin page, add:

- A **cohort dropdown** to select which cohort to operate on
- A **"Run Allocation"** button that calls `/api/allocate-cohort?cohort=2029`
- A **"Download Roster CSV"** button that calls `/api/export-cohort-roster?cohort=2029`
- The existing detailed CSV export remains available

---

## What Does NOT Change

- The vibe quiz questions and answer logic remain the same
- The sorting/ranking page remains the same (still cosmetic)
- The sub-attribute display at quiz completion remains the same (user sees "Purpose", "Voyage", etc.)
- The user still sees a naive legacy result at quiz end — the batch allocation may differ, but only admins see that

---

## File Change Summary

| File | Change |
|---|---|
| `src/pages/index.tsx` or new pre-quiz page | Add name + cohort input form |
| `src/pages/Final.tsx` | Store full affinity vector in Firestore |
| `src/pages/api/allocate-cohort.ts` | **NEW** — batch allocation endpoint |
| `src/pages/api/export-cohort-roster.ts` | **NEW** — simple per-cohort CSV |
| `src/pages/api/export-responses.ts` | Add `cohort` and `allocatedLegacy` columns |
| `src/pages/super-secret.tsx` (or admin page) | Add cohort selector, allocation button, roster download |
| `tests/` | **NEW** — allocation algorithm tests (see `allocation-test-spec.md`) |
