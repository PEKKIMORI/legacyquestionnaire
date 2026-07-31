import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "../../firebase";
import type { CohortOverview } from "./api/cohort-overview";

const CURRENT_YEAR = new Date().getFullYear();
const COHORT_YEARS = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR + i));

const SuperSecretPage: React.FC = () => {
  const [selectedCohort, setSelectedCohort] = useState(COHORT_YEARS[0] ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [allocationResult, setAllocationResult] = useState<{
    totalUsers: number;
    allocations: Record<string, number>;
    top1Rate: number;
    top3Rate: number;
    skipped: number;
  } | null>(null);
  const [allocationError, setAllocationError] = useState("");
  const [overview, setOverview] = useState<CohortOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      // Sign-in cancelled or failed; nothing to do.
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // Attach the signed-in user's Firebase ID token so the API can authorize the
  // request server-side. The admin allowlist is enforced there, not here.
  const authedFetch = async (input: string, init: RequestInit = {}) => {
    if (!auth.currentUser) throw new Error("not-signed-in");
    const token = await auth.currentUser.getIdToken();
    return fetch(input, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    try {
      const res = await authedFetch("/api/export-responses");
      if (!res.ok) {
        alert(`Failed to download CSV: ${await res.text()}`);
        return;
      }
      downloadBlob(await res.blob(), "responses.csv");
    } catch {
      alert("You must be signed in as an admin.");
    }
  };

  const handleDownloadRoster = async () => {
    try {
      const res = await authedFetch(
        `/api/export-cohort-roster?cohort=${encodeURIComponent(selectedCohort)}`,
      );
      if (!res.ok) {
        alert(`Failed to download roster: ${await res.text()}`);
        return;
      }
      downloadBlob(await res.blob(), `cohort-${selectedCohort}-roster.csv`);
    } catch {
      alert("You must be signed in as an admin.");
    }
  };

  const handleLoadOverview = async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const res = await authedFetch(
        `/api/cohort-overview?cohort=${encodeURIComponent(selectedCohort)}`,
      );
      if (!res.ok) {
        setOverviewError(`Failed to load overview: ${await res.text()}`);
        setOverview(null);
        return;
      }
      setOverview((await res.json()) as CohortOverview);
    } catch {
      setOverviewError("You must be signed in as an admin.");
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  };

  const handleRunAllocation = async () => {
    const confirmed = window.confirm(
      `This will run batch legacy allocation for cohort ${selectedCohort} and overwrite any existing allocations. Continue?`,
    );
    if (!confirmed) return;

    setAllocating(true);
    setAllocationError("");
    setAllocationResult(null);

    try {
      const res = await authedFetch("/api/allocate-cohort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort: selectedCohort }),
      });
      if (!res.ok) {
        setAllocationError(`Allocation failed: ${await res.text()}`);
        return;
      }
      const data = (await res.json()) as {
        totalUsers: number;
        allocations: Record<string, number>;
        top1Rate: number;
        top3Rate: number;
        skipped: number;
      };
      setAllocationResult(data);
    } catch {
      setAllocationError("You must be signed in as an admin.");
    } finally {
      setAllocating(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-yellow-100 via-pink-200 to-purple-200 p-6">
      <div className="w-full max-w-5xl rounded-3xl border-2 border-yellow-400 bg-white/95 p-12 shadow-2xl backdrop-blur-lg">
        <p className="mb-6 text-center text-xl text-gray-700">
          Congratulations! You&apos;ve unlocked the{" "}
          <span className="font-semibold text-pink-600">super secret</span>{" "}
          page.
          <br />
          You truly have the heart of a legend.
        </p>
        <div className="mb-8 flex justify-center text-4xl">
          {Array.from({ length: 10 }).map((_, i) => (
            <span className="mx-1" key={i}>
              ❤️
            </span>
          ))}
        </div>

        {!authReady ? (
          <p className="text-center text-base italic text-gray-500">Loading…</p>
        ) : !user ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-center text-base text-gray-600">
              Sign in with your Minerva admin account to manage allocations and
              exports.
            </p>
            <button
              onClick={handleSignIn}
              className="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-bold text-white shadow-lg hover:from-purple-600 hover:to-pink-600"
            >
              Sign in with Google
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-center gap-3 text-sm text-gray-600">
              <span>
                Signed in as{" "}
                <span className="font-mono font-semibold">{user.email}</span>
              </span>
              <button
                onClick={handleSignOut}
                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
              >
                Sign out
              </button>
            </div>

            {/* Full responses CSV */}
            <div className="mt-2 flex justify-center">
              <button
                onClick={handleDownloadAll}
                className="rounded-lg bg-gradient-to-r from-yellow-400 to-pink-400 px-6 py-3 font-bold text-white shadow-lg hover:from-yellow-500 hover:to-pink-500"
              >
                Download All Responses CSV
              </button>
            </div>

            {/* Batch allocation section */}
            <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <h2 className="mb-4 text-center text-lg font-bold text-gray-800">
                Batch Legacy Allocation
              </h2>

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Cohort
                </label>
                <select
                  value={selectedCohort}
                  onChange={(e) => setSelectedCohort(e.target.value)}
                  className="w-full rounded border border-gray-300 bg-white p-2 text-sm"
                >
                  {COHORT_YEARS.map((year) => (
                    <option key={year} value={year}>
                      Class of {year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRunAllocation}
                  disabled={allocating}
                  className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 font-bold text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
                >
                  {allocating
                    ? "Allocating..."
                    : `Run Allocation for ${selectedCohort}`}
                </button>
                <button
                  onClick={handleDownloadRoster}
                  className="flex-1 rounded-lg bg-gradient-to-r from-green-400 to-teal-400 px-4 py-2 font-bold text-white shadow hover:from-green-500 hover:to-teal-500"
                >
                  Download Roster CSV
                </button>
              </div>

              {allocationError && (
                <p className="mt-3 text-center text-sm text-red-600">
                  {allocationError}
                </p>
              )}

              {allocationResult && (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="mb-2 font-semibold text-green-800">
                    Allocation complete — {allocationResult.totalUsers} users
                    assigned
                    {allocationResult.skipped > 0 &&
                      ` (${allocationResult.skipped} skipped)`}
                  </p>
                  <p className="text-sm text-gray-600">
                    Top-1 rate: {(allocationResult.top1Rate * 100).toFixed(1)}%
                    &nbsp;|&nbsp; Top-3 rate:{" "}
                    {(allocationResult.top3Rate * 100).toFixed(1)}%
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-1 text-xs text-gray-700">
                    {Object.entries(allocationResult.allocations)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([legacy, count]) => (
                        <span key={legacy}>
                          {legacy}: <strong>{count}</strong>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cohort overview dashboard */}
            <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <h2 className="mb-4 text-center text-lg font-bold text-gray-800">
                Cohort Overview
              </h2>

              <div className="flex justify-center">
                <button
                  onClick={handleLoadOverview}
                  disabled={overviewLoading}
                  className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-2 font-bold text-white shadow hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50"
                >
                  {overviewLoading
                    ? "Loading..."
                    : `Load Overview for ${selectedCohort}`}
                </button>
              </div>

              {overviewError && (
                <p className="mt-3 text-center text-sm text-red-600">
                  {overviewError}
                </p>
              )}

              {overview && (
                <div className="mt-6 space-y-6">
                  {/* Headline counts */}
                  <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
                    {(
                      [
                        ["Responses", overview.counts.total],
                        ["Complete", overview.counts.complete],
                        ["Incomplete", overview.counts.incomplete],
                        ["Allocated", overview.counts.allocated],
                        ["Awaiting", overview.counts.awaiting],
                      ] as const
                    ).map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-gray-200 bg-white p-3"
                      >
                        <div className="text-2xl font-bold text-gray-800">
                          {value}
                        </div>
                        <div className="text-xs text-gray-500">{label}</div>
                      </div>
                    ))}
                  </div>

                  {overview.counts.allocated > 0 && (
                    <p className="text-center text-sm text-gray-600">
                      Of allocated members:{" "}
                      {(overview.top1Rate * 100).toFixed(1)}% (
                      {overview.top1Count}/{overview.rankedCount}) got their top
                      choice, {(overview.top3Rate * 100).toFixed(1)}% (
                      {overview.top3Count}/{overview.rankedCount}) got a top-3
                      choice.
                    </p>
                  )}

                  {/* Legacy sizes */}
                  {overview.counts.allocated > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-bold text-gray-700">
                        Members per legacy
                      </h3>
                      <div className="grid grid-cols-3 gap-1 text-xs text-gray-700 sm:grid-cols-5">
                        {Object.entries(overview.legacyCounts)
                          .sort((a, b) => a[0].localeCompare(b[0]))
                          .map(([legacy, count]) => (
                            <span key={legacy}>
                              {legacy}: <strong>{count}</strong>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Per-user table */}
                  <div>
                    <h3 className="mb-2 text-sm font-bold text-gray-700">
                      Everyone in {overview.cohort} ({overview.users.length})
                    </h3>
                    <div className="max-h-96 overflow-auto rounded-xl border border-gray-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-gray-100 text-gray-600">
                          <tr>
                            <th className="p-2">Name</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Vibe</th>
                            <th className="p-2">Top 3 legacies (score)</th>
                            <th className="p-2">Allocated</th>
                            <th className="p-2">Rank</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.users.map((u) => (
                            <tr
                              key={u.email || u.name}
                              className="border-t border-gray-100"
                            >
                              <td className="p-2 font-medium text-gray-800">
                                {u.name}
                                <div className="font-normal text-gray-400">
                                  {u.email}
                                </div>
                              </td>
                              <td className="p-2">
                                <span
                                  className={
                                    u.status === "Allocated"
                                      ? "text-green-700"
                                      : u.status === "Awaiting allocation"
                                        ? "text-amber-700"
                                        : "text-gray-400"
                                  }
                                >
                                  {u.status}
                                </span>
                              </td>
                              <td className="p-2">{u.vibe || "—"}</td>
                              <td className="p-2">
                                {u.topLegacies.length > 0
                                  ? u.topLegacies
                                      .map((t) => `${t.legacy} (${t.score})`)
                                      .join(", ")
                                  : "—"}
                              </td>
                              <td className="p-2 font-semibold">
                                {u.allocatedLegacy || "—"}
                              </td>
                              <td className="p-2">{u.assignedRank ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Allocation run history */}
                  <div>
                    <h3 className="mb-2 text-sm font-bold text-gray-700">
                      Allocation run history
                    </h3>
                    {overview.runs.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        No allocation runs recorded yet. (Runs are logged from
                        now on — older runs predate the log.)
                      </p>
                    ) : (
                      <ul className="space-y-1 text-xs text-gray-700">
                        {overview.runs.map((run) => (
                          <li
                            key={run.runAt}
                            className="rounded-lg border border-gray-200 bg-white p-2"
                          >
                            <strong>
                              {run.runAt
                                ? new Date(run.runAt).toLocaleString()
                                : "(unknown time)"}
                            </strong>{" "}
                            by {run.runBy || "(unknown)"} — {run.allocated}{" "}
                            allocated
                            {run.skipped > 0 && `, ${run.skipped} skipped`}, top-1{" "}
                            {(run.top1Rate * 100).toFixed(0)}%, top-3{" "}
                            {(run.top3Rate * 100).toFixed(0)}%
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* How it works */}
            <details className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
              <summary className="cursor-pointer text-center text-lg font-bold text-gray-800">
                How the vibe check works
              </summary>
              <div className="mt-4 space-y-3">
                <p>
                  <strong>1. Questions → affinity scores.</strong> Each
                  multiple-choice answer adds one point to one of the 25
                  legacies. A person&apos;s full point tally is their
                  &ldquo;affinity vector.&rdquo;
                </p>
                <p>
                  <strong>2. Vibe.</strong> When someone finishes, their
                  highest-scoring legacy is found and their vibe word is drawn
                  from that legacy&apos;s three-word pool. The vibe is assigned
                  once and stored — it never changes on later visits.
                </p>
                <p>
                  <strong>3. Allocation (admin-run).</strong> The allocator
                  balances the cohort across all 25 legacies (sizes within one
                  person of each other). People with the strongest single-legacy
                  preference are placed first; everyone gets the highest-ranked
                  legacy that still has room. That is why someone&apos;s
                  assigned legacy can differ from their top-scored legacy — the
                  &ldquo;Rank&rdquo; column shows where their assignment sat in
                  their own preference order.
                </p>
                <p>
                  <strong>4. Re-running allocation reshuffles.</strong> Each run
                  re-allocates the whole cohort from scratch, so assignments can
                  change between runs as new responses arrive. Treat allocation
                  as final only when responses have closed.
                </p>
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
};

export default SuperSecretPage;
