import type { CredoPositions } from "~/utils/allocate";

/**
 * The credo sorting screens as stored on a response document.
 *
 * Screens 0-4 each rank five legacies against each other; screen 5 ranks
 * Minerva's core competencies and is not about legacies, so it is skipped.
 * A legacy's position is its index on its own screen, 0 being ranked first.
 *
 * Note that a person only ever compares legacies within a screen, so this
 * says how highly they rated a legacy among its peers, not a direct
 * head-to-head between two legacies from different screens.
 */
const LEGACY_SCREENS = [0, 1, 2, 3, 4];

export function credoPositionsFromResponse(
  data: Record<string, unknown>,
): CredoPositions | undefined {
  const positions: CredoPositions = {};
  let found = false;
  for (const screen of LEGACY_SCREENS) {
    const group = data[`sorting_group_${screen}`] as
      | { order?: unknown }
      | undefined;
    const order = group?.order;
    if (!Array.isArray(order)) continue;
    order.forEach((legacy, index) => {
      if (typeof legacy === "string") {
        positions[legacy] = index;
        found = true;
      }
    });
  }
  return found ? positions : undefined;
}
