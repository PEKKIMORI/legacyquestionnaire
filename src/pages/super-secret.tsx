import React, { useState } from "react";

const CURRENT_YEAR = new Date().getFullYear();
const COHORT_YEARS = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR + i));

const SuperSecretPage: React.FC = () => {
  const [selectedCohort, setSelectedCohort] = useState(COHORT_YEARS[0] ?? "");
  const [adminSecret, setAdminSecret] = useState("");
  const [allocating, setAllocating] = useState(false);
  const [allocationResult, setAllocationResult] = useState<{
    totalUsers: number;
    allocations: Record<string, number>;
    top1Rate: number;
    top3Rate: number;
    skipped: number;
  } | null>(null);
  const [allocationError, setAllocationError] = useState("");

  const handleDownloadAll = async () => {
    const res = await fetch("/api/export-responses");
    if (!res.ok) {
      alert("Failed to download CSV");
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "responses.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadRoster = async () => {
    if (!adminSecret) {
      alert("Admin secret is required to download the roster.");
      return;
    }
    const res = await fetch(`/api/export-cohort-roster?cohort=${encodeURIComponent(selectedCohort)}&adminSecret=${encodeURIComponent(adminSecret)}`);
    if (!res.ok) {
      alert("Failed to download roster");
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cohort-${selectedCohort}-roster.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleRunAllocation = async () => {
    if (!adminSecret) {
      setAllocationError("Admin secret is required.");
      return;
    }
    const confirmed = window.confirm(
      `This will run batch legacy allocation for cohort ${selectedCohort} and overwrite any existing allocations. Continue?`,
    );
    if (!confirmed) return;

    setAllocating(true);
    setAllocationError("");
    setAllocationResult(null);

    try {
      const res = await fetch("/api/allocate-cohort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort: selectedCohort, adminSecret }),
      });
      if (!res.ok) {
        const text = await res.text();
        setAllocationError(`Allocation failed: ${text}`);
        return;
      }
      const data = await res.json() as {
        totalUsers: number;
        allocations: Record<string, number>;
        top1Rate: number;
        top3Rate: number;
        skipped: number;
      };
      setAllocationResult(data);
    } catch (err) {
      setAllocationError("Network error. Please try again.");
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
        <p className="text-center text-base italic text-gray-500">
          (Password: <span className="font-mono">tenofhearts</span>)
        </p>

        {/* Full responses CSV */}
        <div className="mt-8 flex justify-center">
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

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Admin Secret
            </label>
            <input
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              className="w-full rounded border border-gray-300 p-2 text-sm"
              placeholder="Enter admin API secret"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRunAllocation}
              disabled={allocating}
              className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 font-bold text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
            >
              {allocating ? "Allocating..." : `Run Allocation for ${selectedCohort}`}
            </button>
            <button
              onClick={handleDownloadRoster}
              className="flex-1 rounded-lg bg-gradient-to-r from-green-400 to-teal-400 px-4 py-2 font-bold text-white shadow hover:from-green-500 hover:to-teal-500"
            >
              Download Roster CSV
            </button>
          </div>

          {allocationError && (
            <p className="mt-3 text-center text-sm text-red-600">{allocationError}</p>
          )}

          {allocationResult && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="mb-2 font-semibold text-green-800">
                Allocation complete — {allocationResult.totalUsers} users assigned
                {allocationResult.skipped > 0 && ` (${allocationResult.skipped} skipped)`}
              </p>
              <p className="text-sm text-gray-600">
                Top-1 rate: {(allocationResult.top1Rate * 100).toFixed(1)}% &nbsp;|&nbsp;
                Top-3 rate: {(allocationResult.top3Rate * 100).toFixed(1)}%
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
      </div>
    </main>
  );
};

export default SuperSecretPage;
