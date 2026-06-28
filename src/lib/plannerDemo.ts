export const DEFAULT_PLANNER_SOURCE_ID = "dynamic-vloop";
export const DEFAULT_TARGET_AXIS_IDS = ["coding", "multi_step_reasoning"];
export const DEFAULT_BENCHMARK_COUNT = 5;

export const BUILDER_COPY = {
  eyebrow: "Capability-targeted evaluation planner",
  title: "Build a compact benchmark suite for an agentic coding assistant.",
  summary:
    "Target coding plus multi-step reasoning, reduce redundant benchmarks, shortlist models, then validate against full-suite and held-out rankings.",
  demoPath: "Demo path: coding + multi-step reasoning, budget k=5",
  selectionPrinciple: "Not just top correlated benchmarks",
};

// Add a capability here only after adding the matching axis id to
// data/benchmark_axis_weights.json. The UI highlights ids listed in
// DEFAULT_TARGET_AXIS_IDS on the first screen.
export const CAPABILITY_OPTIONS = [
  ["coding", "Coding"],
  ["multi_step_reasoning", "Multi-step reasoning"],
  ["math_reasoning", "Math reasoning"],
  ["factual_qa", "Factual QA"],
  ["long_context_retrieval", "Long-context retrieval"],
] as const;

// Dynamic V-loop lineage states. Keep this map in sync with
// data/axis_lineage.json when adding new guardrail outcomes.
export const LINEAGE_BADGE_CLASS: Record<string, string> = {
  new: "border-emerald-300 bg-emerald-50 text-emerald-800",
  merged: "border-amber-300 bg-amber-50 text-amber-800",
  split: "border-sky-300 bg-sky-50 text-sky-800",
  renamed: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800",
  unchanged: "border-neutral-300 bg-neutral-50 text-neutral-600",
};

export const VALIDATION_BAR_SPECS = [
  ["Spearman", "spearman", "bg-emerald-500"],
  ["Kendall tau", "kendall_tau", "bg-cyan-500"],
  ["NDCG@5", "ndcg_at_5", "bg-sky-500"],
] as const;

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function prettyId(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function metricLabel(id: string): string {
  return id.replaceAll("_", " ");
}

export function coverageBarWidth(value: number): string {
  return `${Math.max(12, value * 100)}%`;
}

export function metricBarWidth(value: number): string {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

export function regretBarWidth(value: number): string {
  return `${Math.max(0, Math.min(100, value * 1000))}%`;
}
