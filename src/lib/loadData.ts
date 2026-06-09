import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Benchmark,
  BenchmarkCategory,
  Model,
  ScoreRecord,
} from "./types.ts";
import { mergeScores } from "../../scripts/lib/merge.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..");
const DATA = path.join(ROOT, "data");
const SCORES = path.join(DATA, "scores");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

export async function loadBenchmarks(): Promise<Benchmark[]> {
  return readJson<Benchmark[]>(path.join(DATA, "benchmarks.json"), []);
}

/**
 * Hand-curated "important" benchmark ids. These always appear in their
 * category tab even if only a few models have been scored yet.
 */
async function loadWellKnownBenchmarkIds(): Promise<Set<string>> {
  const list = await readJson<Array<{ id: string }>>(
    path.join(DATA, "_well-known-benchmarks.json"),
    [],
  );
  return new Set(list.map((b) => b.id));
}

/** A benchmark column is shown in a category tab if it has at least this many
 *  scored models — below it the column is mostly empty and only clutters the
 *  view, so it's relegated to the All tab. */
const CORE_MIN_MODELS = 6;

/** Category slugs that show the full long tail (no core filtering). */
const OVERVIEW_CATEGORIES = new Set<CategorySlug>([
  "all",
  "deterministic",
  "non_deterministic",
]);

export async function loadModels(): Promise<Model[]> {
  return readJson<Model[]>(path.join(DATA, "models.json"), []);
}

export async function loadAllScores(): Promise<ScoreRecord[]> {
  let files: string[];
  try {
    files = await fs.readdir(SCORES);
  } catch {
    return [];
  }
  const out: ScoreRecord[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    if (f.startsWith("_")) continue;
    const recs = await readJson<ScoreRecord[]>(path.join(SCORES, f), []);
    out.push(...recs);
  }
  // tech-reports/ — flatten one level deeper
  try {
    const trDir = path.join(SCORES, "tech-reports");
    const trs = await fs.readdir(trDir);
    for (const f of trs) {
      if (!f.endsWith(".json") || f.endsWith(".draft.json")) continue;
      const recs = await readJson<ScoreRecord[]>(path.join(trDir, f), []);
      out.push(...recs);
    }
  } catch {
    /* no tech-reports yet */
  }
  // Cross-file merge: variants from different sources fold together so the
  // UI sees one canonical record per (model, benchmark) with the alternates
  // in variants[].
  return mergeScores([], out);
}

export type CategorySlug =
  | BenchmarkCategory
  | "non_deterministic"
  | "nd_preference"
  | "nd_agent"
  | "nd_safety"
  | "nd_korean"
  | "nd_multilinguality"
  | "deterministic"
  | "all";

export interface CategoryView {
  category: CategorySlug;
  benchmarks: Benchmark[];
  models: Model[];
  /** Rows: one per model that has at least one score in this category. */
  rows: Array<{
    model: Model;
    scores: Record<string, ScoreRecord>;
  }>;
  /** How many in-category benchmarks were hidden by core filtering (long
   *  tail with too few scored models). 0 for overview tabs. */
  hiddenBenchmarks: number;
}

export async function buildView(category: CategorySlug): Promise<CategoryView> {
  const [benchmarks, models, allScores, wellKnownIds] = await Promise.all([
    loadBenchmarks(),
    loadModels(),
    loadAllScores(),
    loadWellKnownBenchmarkIds(),
  ]);

  const inCategory = (b: Benchmark) => {
    if (category === "all") return true;
    if (category === "non_deterministic") return b.type === "non_deterministic";
    if (category === "nd_preference") return b.type === "non_deterministic" && b.category === "preference";
    if (category === "nd_agent") return b.type === "non_deterministic" && b.category === "agent";
    if (category === "nd_safety") return b.type === "non_deterministic" && b.category === "safety";
    if (category === "nd_korean") return b.type === "non_deterministic" && b.category === "korean";
    if (category === "nd_multilinguality") return b.type === "non_deterministic" && b.category === "multilinguality";
    if (category === "deterministic") return b.type === "deterministic";
    return b.category === category && b.type === "deterministic";
  };

  const allInCat = benchmarks.filter(inCategory);

  // Core filtering: leaf category tabs only show benchmarks that are either
  // hand-curated (well-known) or have enough scored models to be worth a
  // column. Overview tabs (all/deterministic/non_deterministic) show the
  // full long tail.
  const modelCount = new Map<string, Set<string>>();
  for (const s of allScores) {
    let set = modelCount.get(s.benchmark_id);
    if (!set) {
      set = new Set();
      modelCount.set(s.benchmark_id, set);
    }
    set.add(s.model_id);
  }
  const isCore = (b: Benchmark) =>
    wellKnownIds.has(b.id) ||
    (modelCount.get(b.id)?.size ?? 0) >= CORE_MIN_MODELS;

  const curated = !OVERVIEW_CATEGORIES.has(category);
  const benchInCat = curated ? allInCat.filter(isCore) : allInCat;
  const hiddenBenchmarks = curated ? allInCat.length - benchInCat.length : 0;
  const benchIds = new Set(benchInCat.map((b) => b.id));

  const byModel = new Map<string, Record<string, ScoreRecord>>();
  for (const s of allScores) {
    if (!benchIds.has(s.benchmark_id)) continue;
    let bucket = byModel.get(s.model_id);
    if (!bucket) {
      bucket = {};
      byModel.set(s.model_id, bucket);
    }
    bucket[s.benchmark_id] = s;
  }

  const modelById = new Map(models.map((m) => [m.id, m]));
  const rows = [...byModel.entries()]
    .map(([id, scores]) => {
      const m = modelById.get(id) ?? {
        id,
        name: id,
        vendor: "Unknown",
        aliases: [],
      };
      return { model: m, scores };
    })
    .sort((a, b) => a.model.name.localeCompare(b.model.name));

  const benchSorted = [...benchInCat].sort((a, b) => a.name.localeCompare(b.name));

  return {
    category,
    benchmarks: benchSorted,
    models,
    rows,
    hiddenBenchmarks,
  };
}
