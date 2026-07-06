import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "../../firebase";

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
      <div className="w-full max-w-2xl rounded-3xl border-2 border-yellow-400 bg-white/95 p-12 shadow-2xl backdrop-blur-lg">
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
          </>
        )}
      </div>
    </main>
  );
};

export default SuperSecretPage;
