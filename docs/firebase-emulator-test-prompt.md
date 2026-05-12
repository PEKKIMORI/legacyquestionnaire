# Firebase Emulator Integration Test Prompt

Copy everything below the line and paste it into a new Claude Code session.

---

## Task

Set up Firebase Emulator Suite for local integration testing of this Next.js app's API endpoints, then write and run comprehensive integration tests using Vitest. **Do not modify any existing source code** — only add test infrastructure and test files.

## Context

This is a Minerva University legacy questionnaire app (Next.js 15 + TypeScript + Firebase Auth/Firestore). We have a batch allocation system that:

1. Students complete a questionnaire; their results are stored in Firestore `responses` collection
2. An admin hits POST `/api/allocate-cohort` with `{ cohort, adminSecret }` to run batch allocation
3. The algorithm reads `affinityVector` from each user's doc, runs a margin-based greedy allocation, and writes `allocatedLegacy` + `allocatedAt` back to each doc
4. GET `/api/export-cohort-roster?cohort=X&adminSecret=Y` returns a CSV of Legacy,Name for all allocated users in that cohort
5. GET `/api/export-responses` returns a full CSV export of all responses

The core allocation algorithm (`src/utils/allocate.ts`) already has 121 unit tests. What we need now is **integration tests that exercise the full Firestore read/write cycle through the actual API handlers**.

## Architecture Reference

### Key files (READ THESE before writing any code):

- `src/pages/api/allocate-cohort.ts` — POST endpoint, reads `responses` collection filtered by cohort + isCompleted, calls `allocateCohort()`, writes results back in batches of 500
- `src/pages/api/export-cohort-roster.ts` — GET endpoint, reads allocated responses, returns CSV
- `src/pages/api/export-responses.ts` — GET endpoint, full CSV export (uses Firebase Auth + Google People API for name lookup)
- `src/utils/firebaseAdmin.ts` — shared Firebase Admin SDK init, exports `db` and `admin`
- `src/utils/allocate.ts` — pure allocation algorithm, exports `LEGACIES` (25 legacy names), `allocateCohort()`, `UserAffinity`, etc.
- `vitest.config.ts` — existing Vitest config with `~` path alias
- `package.json` — uses `"type": "module"`, Vitest 4.1.2

### Firestore document schema (`responses` collection):

```typescript
{
  userId: string;           // Firebase Auth UID
  userName: string;         // self-reported name
  cohort: string;           // e.g. "2029"
  isCompleted: boolean;     // true when questionnaire is done
  results: {
    displayCategory: string;      // cosmetic top legacy shown to user
    affinityVector: {             // Record<string, number> — points per legacy
      Cable: 5,
      Chronicle: 12,
      Mission: 8,
      // ... up to 25 legacies
    }
  };
  allocatedLegacy?: string;   // written by allocate-cohort API
  allocatedAt?: Timestamp;    // written by allocate-cohort API
  startedAt: Timestamp;
  demographics: { gender: string; country: string; ageRange: string; };
}
```

### The 25 legacies (alphabetical order):
Cable, Chronicle, Circuit, Civic, Eureka, Field, Gate, Hunter, Labyrinth, Lands, Laurel, Legion, Liberty, Mason, Mission, North, Ocean, Octagon, Pier, Plaza, Pyramid, Reserve, Tower, Union, Vista

### Auth:
- API endpoints use `ADMIN_API_SECRET` env var compared with `crypto.timingSafeEqual`
- `export-responses` has no auth guard (existing behavior)

## Step 1: Set up Firebase Emulator

1. Install Firebase CLI if not present: `npm install -D firebase-tools`
2. Create `firebase.json` in the project root (if it doesn't exist or needs updating) with emulator config:
   ```json
   {
     "emulators": {
       "firestore": { "port": 8080 },
       "auth": { "port": 9099 }
     }
   }
   ```
3. Make `firebaseAdmin.ts` emulator-aware. The Firebase Admin SDK automatically connects to the emulator when `FIRESTORE_EMULATOR_HOST` is set — we do NOT need to change the source file. We'll set env vars in our test setup instead.

## Step 2: Create test setup

Create `src/tests/emulator-setup.ts`:
- Set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` **before** any Firebase imports
- Set `ADMIN_API_SECRET=test-secret-for-emulator`
- Set `GCLOUD_PROJECT=demo-legacy-test` (use `demo-` prefix so Firebase knows it's not a real project)
- Export a helper to get a fresh Firestore instance pointing at the emulator
- Export a `clearFirestore()` helper that uses the emulator REST API: `DELETE http://127.0.0.1:8080/emulator/v1/projects/demo-legacy-test/databases/(default)/documents`
- Export seed helpers (see below)

Create or update `vitest.config.ts` to add a separate test configuration for integration tests:
- Integration tests should be in `src/tests/integration/**/*.test.ts`
- They should use the emulator setup file
- Consider using a separate vitest workspace or a `vitest.integration.config.ts` so unit tests and integration tests can run independently

Add a script to `package.json`:
```json
"test:integration": "firebase emulators:exec --only firestore,auth 'npx vitest run --config vitest.integration.config.ts'"
```
This starts the emulators, runs the tests, and tears down the emulators automatically.

## Step 3: Seed data helpers

Create `src/tests/helpers/seed.ts` with functions to populate the emulator Firestore:

```typescript
// seedUser: create a single response doc
async function seedUser(params: {
  userId: string;
  userName: string;
  cohort: string;
  isCompleted: boolean;
  affinityVector: Partial<Record<string, number>>;
  allocatedLegacy?: string;  // for pre-allocated test scenarios
}): Promise<string>  // returns doc ID

// seedCohort: create N users for a cohort with randomized affinity vectors
async function seedCohort(params: {
  cohort: string;
  count: number;
  affinityGenerator?: (index: number) => Partial<Record<string, number>>;
}): Promise<string[]>  // returns array of userIds

// seedAllocatedCohort: create N users who already have allocatedLegacy set
// (for testing roster export)
async function seedAllocatedCohort(params: {
  cohort: string;
  count: number;
}): Promise<void>
```

Use the same seeded PRNG approach as the existing unit tests (mulberry32) for reproducible test data.

## Step 4: Write integration tests

Create `src/tests/integration/allocate-cohort.test.ts`:

### 4A. allocate-cohort API tests

Since these are Next.js API routes (not Express), you need to call the handler functions directly by importing them and passing mock `NextApiRequest`/`NextApiResponse` objects. Create a helper `callApiHandler(handler, { method, body?, query? })` that creates mock req/res objects and returns `{ status, data/body }`.

**Tests to write:**

1. **Auth rejection — missing secret**: POST with no adminSecret → 401
2. **Auth rejection — wrong secret**: POST with wrong adminSecret → 401
3. **Auth rejection — empty ADMIN_API_SECRET env**: When env var is empty string → 401 even with matching empty secret
4. **Method not allowed**: GET request → 405
5. **Missing cohort**: POST with valid secret but no cohort → 400
6. **Empty cohort — no users**: POST for cohort with zero matching docs → 200 with totalUsers: 0
7. **Small cohort (5 users)**: Seed 5 users for cohort "2029", run allocation → verify:
   - Response status 200
   - `totalUsers` === 5
   - `allocations` object has entries summing to 5
   - Each allocated legacy is one of the 25 valid legacies
   - Verify Firestore: each user doc now has `allocatedLegacy` field set
   - Verify Firestore: each user doc now has `allocatedAt` timestamp
8. **Standard cohort (75 users)**: Seed 75 users → verify:
   - All 75 allocated
   - Balance: no legacy has more than `ceil(75/25)` = 3 members
   - Every allocatedLegacy written to Firestore matches the API response
9. **Large cohort (500+ users)**: Seed 501 users → verify:
   - Tests the batch write logic (500 per batch, so this needs 2 batches)
   - All 501 users get allocated
   - Firestore docs all updated
10. **Skips incomplete users**: Seed 10 users with isCompleted=true and 5 with isCompleted=false → verify only 10 allocated
11. **Skips users without affinityVector**: Seed users where results.affinityVector is missing or empty → should be in `skipped`
12. **Cohort isolation**: Seed users in cohort "2029" AND "2030", allocate only "2029" → verify "2030" docs are untouched
13. **Idempotency**: Run allocation twice for same cohort → second run should overwrite (not error or duplicate)
14. **top1Rate and top3Rate are plausible**: With random affinities, top1Rate should be > 0 and top3Rate > top1Rate
15. **Affinity vector correctness**: Seed 3 users with hand-crafted affinities where optimal allocation is known, verify each gets expected legacy

### 4B. export-cohort-roster API tests

Create `src/tests/integration/export-cohort-roster.test.ts`:

1. **Auth rejection — missing secret**: GET with no adminSecret → 401
2. **Auth rejection — wrong secret**: → 401
3. **Missing cohort param**: → 400
4. **Empty cohort**: No docs match → 200 with message "No completed responses found"
5. **Normal roster**: Seed 10 pre-allocated users → verify:
   - Response Content-Type is `text/csv`
   - Content-Disposition has correct filename
   - CSV has header row "Legacy,Name"
   - CSV has exactly 10 data rows
   - Each row's Legacy column is a valid legacy
   - Rows are sorted by legacy name alphabetically, then by name within each legacy
6. **CSV escaping**: Seed a user with comma in name (`"O'Brien, Pat"`) → verify CSV properly quotes/escapes it
7. **Unallocated users excluded**: Seed some users without `allocatedLegacy` → they should not appear in CSV
8. **Cohort isolation**: Seed users in two cohorts → roster for one cohort doesn't include the other

### 4C. export-responses API tests

Create `src/tests/integration/export-responses.test.ts`:

NOTE: This endpoint calls `admin.auth().getUser()` which won't work against the Auth emulator unless you also create Auth users. You can either:
- Create users in the Auth emulator using `admin.auth().createUser()` in your seed function
- Or just test the Firestore-only path (users without Auth records will get blank userName from Auth, but self-reported `userName` from the doc should still appear)

1. **Empty collection**: No docs → 200 with "No data found"
2. **Single user**: Seed 1 completed user with all fields → verify CSV has correct columns and values
3. **Multiple users**: Seed 5 users → verify 5 data rows
4. **Contains new columns**: Verify CSV includes `cohort` and `allocatedLegacy` columns
5. **userName prefers self-reported**: Seed user with `userName` field in Firestore doc → that name appears in CSV (not Auth displayName)
6. **Handles missing optional fields gracefully**: Seed user without `allocatedLegacy`, without `cohort` → CSV row has empty values for those columns, doesn't crash

### 4D. Cross-endpoint integration tests

Create `src/tests/integration/end-to-end.test.ts`:

1. **Full flow**: Seed 50 users for cohort "2029" → call allocate-cohort → call export-cohort-roster → verify:
   - Roster CSV contains exactly 50 rows
   - Every user appears in the roster
   - Legacy distribution in roster matches allocate-cohort response
2. **Full flow then re-export**: Allocate → export responses CSV → verify `allocatedLegacy` column is populated for all cohort users
3. **Allocate then re-allocate**: Seed users → allocate → change some affinity vectors in Firestore → re-allocate → verify allocations changed and Firestore reflects new values

## Step 5: Run and verify

1. Run `npm run test:integration` and verify all tests pass
2. If any test fails, debug and fix the **test code** (not the source code). If you discover a genuine bug in the source, note it but do not fix it — report it to me.
3. Show me the final test run output

## Important constraints

- **Do NOT modify any files in `src/pages/` or `src/utils/` or `src/components/`** — only add test infrastructure
- The existing `vitest.config.ts` and unit tests (`src/utils/allocate.test.ts`) must continue to work unchanged
- Use the `demo-` project ID prefix for the emulator (this tells Firebase SDKs not to attempt any real Google Cloud operations)
- Clean Firestore between each test (use `beforeEach` with `clearFirestore()`) so tests don't depend on ordering
- Keep the test timeout generous (10s per test) since emulator operations are slower than pure functions
- If the `callApiHandler` mock approach for Next.js API routes gets complicated, an alternative is to use `node-mocks-http` (`npm install -D node-mocks-http`) which provides proper mock req/res objects for Next.js API handlers
