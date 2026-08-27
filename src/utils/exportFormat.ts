/**
 * Shared formatting for the admin CSV exports.
 *
 * These files are read by people, in a spreadsheet, so values are rendered as
 * plain readable text rather than raw stored structures.
 */
import {
  isArbitrarilyRanked,
  rankLegacies,
  type CredoPositions,
} from "~/utils/allocate";

export type Affinity = Partial<Record<string, number>> | undefined;

/** Quote a field only when it would otherwise break the CSV. */
export function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd" */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * "2026-08-19 22:43" rather than an ISO string: still sorts correctly in a
 * spreadsheet, but reads like a date. Blank when there is no timestamp.
 */
export function formatDateTime(value: unknown): string {
  let date: Date | null = null;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    try {
      date = (value as { toDate: () => Date }).toDate();
    } catch {
      return "";
    }
  } else if (value instanceof Date) {
    date = value;
  }
  if (!date || Number.isNaN(date.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
    ` ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}`
  );
}

/**
 * The person's legacies in preference order as "Legacy (score)".
 * Only legacies they actually scored points in are returned: past that,
 * rankLegacies is only breaking ties alphabetically between zeros, which
 * would imply a preference that does not exist.
 */
export function scoredChoices(
  affinity: Affinity,
  limit?: number,
  credo?: CredoPositions,
): string[] {
  if (!affinity) return [];
  const ranked = rankLegacies(affinity, credo).filter(
    (l) => (affinity[l] ?? 0) > 0,
  );
  const slice = limit === undefined ? ranked : ranked.slice(0, limit);
  return slice.map((l) => `${l} (${affinity[l] ?? 0})`);
}

/** Fixed-width version of scoredChoices, padded with blanks for CSV columns. */
export function choiceColumns(
  affinity: Affinity,
  count: number,
  credo?: CredoPositions,
): string[] {
  const choices = scoredChoices(affinity, count, credo);
  return Array.from({ length: count }, (_, i) => choices[i] ?? "");
}

/**
 * Where the allocated legacy sat in the person's own ranking.
 *
 * Marked "tied" only when the ordinal really is arbitrary: same question
 * score and nothing in their credo ranking to separate them. Phrased without
 * a comma so the cell never needs quoting.
 */
export function allocationLabel(
  allocatedLegacy: string,
  affinity: Affinity,
  credo?: CredoPositions,
): { label: string; rank: string } {
  if (!allocatedLegacy) return { label: "", rank: "" };
  if (!affinity) return { label: allocatedLegacy, rank: "" };

  const ranked = rankLegacies(affinity, credo);
  const rank = ranked.indexOf(allocatedLegacy);
  const score = affinity[allocatedLegacy] ?? 0;
  if (rank < 0 || score <= 0) {
    return { label: `${allocatedLegacy} (unranked)`, rank: "" };
  }
  const tied = isArbitrarilyRanked(allocatedLegacy, affinity, credo);
  return {
    label: `${allocatedLegacy} (${tied ? "tied " : ""}${ordinal(rank + 1)} choice)`,
    rank: String(rank + 1),
  };
}

/** Allocated / Awaiting allocation / Incomplete */
export function responseStatus(
  isCompleted: boolean,
  allocatedLegacy: string,
): string {
  if (!isCompleted) return "Incomplete";
  return allocatedLegacy ? "Allocated" : "Awaiting allocation";
}

/**
 * A stored drag-and-drop ranking, rendered as "Cable > Circuit > Civic".
 * Arrow-separated so the cell reads as an order and needs no quoting.
 */
export function formatRanking(value: unknown): string {
  const order = (value as { order?: unknown } | undefined)?.order;
  if (!Array.isArray(order)) return "";
  return order.filter((x): x is string => typeof x === "string").join(" > ");
}
