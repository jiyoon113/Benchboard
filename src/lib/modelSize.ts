// Derive a model's total parameter count (in billions) from its name and
// bucket it into size classes — like the Artificial Analysis index, so the
// leaderboard can be filtered "Small / Medium / Large / ...".
import type { Model } from "./types";

/** Total parameters in billions, parsed from the model name (e.g. "Qwen3.6-35B-A3B"
 *  -> 35, "DeepSeek-V3.2-671B-A37B" -> 671, "Kimi K2 Base (1T-A32B)" -> 1000).
 *  The FIRST <num>B/T token is the total size; a later "A<num>B" is active params.
 *  Returns null for models whose size isn't stated (most proprietary models). */
export function paramsB(model: Pick<Model, "name">): number | null {
  const m = model.name.match(/(\d+(?:\.\d+)?)\s*([bt])\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === "t" ? n * 1000 : n;
}

export interface SizeClass {
  key: string;
  label: string;
  /** sort order, smaller = smaller models; Unknown last */
  order: number;
}

// Thresholds (total params, B). Edit here to retune the buckets.
const SMALL_MAX = 15;
const MEDIUM_MAX = 72;
const LARGE_MAX = 300;

const SMALL: SizeClass = { key: "small", label: "Small (≤15B)", order: 1 };
const MEDIUM: SizeClass = { key: "medium", label: "Medium (15–72B)", order: 2 };
const LARGE: SizeClass = { key: "large", label: "Large (72–300B)", order: 3 };
const XLARGE: SizeClass = { key: "xlarge", label: "X-Large (>300B)", order: 4 };
const UNKNOWN: SizeClass = { key: "unknown", label: "Unknown", order: 5 };

export function sizeClass(model: Pick<Model, "name">): SizeClass {
  const b = paramsB(model);
  if (b === null) return UNKNOWN;
  if (b <= SMALL_MAX) return SMALL;
  if (b <= MEDIUM_MAX) return MEDIUM;
  if (b <= LARGE_MAX) return LARGE;
  return XLARGE;
}

/** Short human label for the parsed size, e.g. "35B" or "1T". null if unknown. */
export function sizeLabel(model: Pick<Model, "name">): string | null {
  const b = paramsB(model);
  if (b === null) return null;
  return b >= 1000 ? `${b / 1000}T` : `${b}B`;
}

export const SIZE_ORDER = [SMALL, MEDIUM, LARGE, XLARGE, UNKNOWN];
