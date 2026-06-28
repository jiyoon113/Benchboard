import benchmarks from "../../data/benchmarks.json";
import models from "../../data/models.json";
import wellKnownBenchmarks from "../../data/_well-known-benchmarks.json";
import { mergeScores } from "../../scripts/lib/merge";
import { sizeClass, sizeLabel } from "../../src/lib/modelSize";
import type { Benchmark, BenchmarkCategory, Model, ScoreRecord } from "../../src/lib/types";
import type { ExplorerData } from "../../src/lib/loadData";

export type CategorySlug = BenchmarkCategory | "deterministic" | "non_deterministic" | "nd_preference" | "nd_agent" | "nd_safety" | "nd_multilinguality" | "nd_korean" | "all";

export interface CategoryView {
  category: CategorySlug;
  benchmarks: Benchmark[];
  rows: Array<{ model: Model; scores: Record<string, ScoreRecord> }>;
  hiddenBenchmarks: number;
}

export interface TrendPoint {
  model: string;
  vendor: string;
  date: string;
  score: number;
}

export interface TrendData {
  names: Record<string, string>;
  data: Record<string, TrendPoint[]>;
}

const scoreModules = import.meta.glob("../../data/scores/*.json", {
  import: "default",
}) as Record<string, () => Promise<ScoreRecord[]>>;

const techReportScoreModules = import.meta.glob("../../data/scores/tech-reports/*.json", {
  import: "default",
}) as Record<string, () => Promise<ScoreRecord[]>>;

const allBenchmarks = benchmarks as Benchmark[];
const allModels = models as Model[];
const modelById = new Map(allModels.map((model) => [model.id, model]));
const benchmarkById = new Map(allBenchmarks.map((benchmark) => [benchmark.id, benchmark]));
const wellKnownIds = new Set((wellKnownBenchmarks as Array<{ id: string }>).map((benchmark) => benchmark.id));

let allScoresCache: ScoreRecord[] | null = null;

async function scoreFiles(): Promise<ScoreRecord[][]> {
  const topLevel = await Promise.all(Object.values(scoreModules).map((load) => load()));
  const techReports = await Promise.all(
    Object.entries(techReportScoreModules)
      .filter(([path]) => !path.endsWith(".draft.json"))
      .map(([, load]) => load()),
  );
  return [...topLevel, ...techReports];
}

export async function loadAllScoresBrowser(): Promise<ScoreRecord[]> {
  if (!allScoresCache) allScoresCache = mergeScores([], (await scoreFiles()).flat());
  return allScoresCache;
}

function inCategory(category: CategorySlug, benchmark: Benchmark): boolean {
  if (category === "all") return true;
  if (category === "deterministic") return benchmark.type === "deterministic";
  if (category === "non_deterministic") return benchmark.type === "non_deterministic";
  if (category === "multimodal") {
    return benchmark.type === "deterministic" && ["multimodal", "vision", "video"].includes(benchmark.category);
  }
  return benchmark.type === "deterministic" && benchmark.category === category;
}

const CORE_MIN_MODELS = 6;
const OVERVIEW_CATEGORIES = new Set<CategorySlug>(["all", "deterministic", "non_deterministic"]);

const generatedScoreViewLoaders = {
  non_deterministic: () => import("./generated/scoreViews/non_deterministic.json"),
  nd_preference: () => import("./generated/scoreViews/nd_preference.json"),
  nd_agent: () => import("./generated/scoreViews/nd_agent.json"),
  nd_safety: () => import("./generated/scoreViews/nd_safety.json"),
  nd_multilinguality: () => import("./generated/scoreViews/nd_multilinguality.json"),
  nd_korean: () => import("./generated/scoreViews/nd_korean.json"),
  deterministic: () => import("./generated/scoreViews/deterministic.json"),
  general: () => import("./generated/scoreViews/general.json"),
  math: () => import("./generated/scoreViews/math.json"),
  coding: () => import("./generated/scoreViews/coding.json"),
  agent: () => import("./generated/scoreViews/agent.json"),
  multimodal: () => import("./generated/scoreViews/multimodal.json"),
  vision: () => import("./generated/scoreViews/vision.json"),
  video: () => import("./generated/scoreViews/video.json"),
  multilinguality: () => import("./generated/scoreViews/multilinguality.json"),
  korean: () => import("./generated/scoreViews/korean.json"),
  all: () => import("./generated/scoreViews/all.json"),
} as const;

const generatedScoreViewCache = new Map<string, CategoryView>();

export async function buildViewBrowser(category: CategorySlug): Promise<CategoryView> {
  const cached = generatedScoreViewCache.get(category);
  if (cached) return cached;
  const load = generatedScoreViewLoaders[category as keyof typeof generatedScoreViewLoaders];
  if (!load) throw new Error(`Missing generated score view loader: ${category}`);
  const mod = await load();
  const view = mod.default as CategoryView;
  generatedScoreViewCache.set(category, view);
  return view;
}


let explorerDataCache: ExplorerData | null = null;

export async function buildExplorerDataBrowser(): Promise<ExplorerData> {
  if (explorerDataCache) return explorerDataCache;
  const mod = await import("./generated/explorerData.json");
  explorerDataCache = mod.default as ExplorerData;
  return explorerDataCache;
}

export async function buildTrendDataBrowser(minPoints = 5): Promise<TrendData> {
  const scores = await loadAllScoresBrowser();
  const byBenchmark = new Map<string, TrendPoint[]>();

  for (const score of scores) {
    if (!benchmarkById.has(score.benchmark_id)) continue;
    const model = modelById.get(score.model_id);
    if (!model?.release_date) continue;
    const date = model.release_date.length === 7 ? `${model.release_date}-15` : model.release_date;
    let points = byBenchmark.get(score.benchmark_id);
    if (!points) {
      points = [];
      byBenchmark.set(score.benchmark_id, points);
    }
    points.push({ model: model.name, vendor: model.vendor, date, score: score.score });
  }

  const names: Record<string, string> = {};
  const data: Record<string, TrendPoint[]> = {};
  for (const [benchmarkId, points] of byBenchmark) {
    if (points.length < minPoints) continue;
    points.sort((a, b) => a.date.localeCompare(b.date));
    names[benchmarkId] = benchmarkById.get(benchmarkId)?.name ?? benchmarkId;
    data[benchmarkId] = points;
  }
  return { names, data };
}

const COVERAGE_BENCH: Array<[string, string]> = [
  ["aime-2024", "AIME 2024"],
  ["aime-2025", "AIME 2025"],
  ["arc-challenge", "ARC Challenge"],
  ["bbh", "BBH"],
  ["drop", "Drop"],
  ["gpqa", "GPQA"],
  ["gsm8k", "GSM8K"],
  ["hle", "HLE"],
  ["hmmt-feb-2025", "HMMT Feb 2025"],
  ["humaneval", "HumanEval"],
  ["math", "MATH"],
  ["math-500", "MATH-500"],
  ["mbpp", "MBPP"],
  ["mmlu", "MMLU"],
  ["mmlu-pro", "MMLU-Pro"],
  ["mmlu-redux", "MMLU-Redux"],
  ["simpleqa", "SimpleQA"],
  ["supergpqa", "SuperGPQA"],
  ["scicode", "SciCode"],
  ["livecodebench", "LiveCodeBench"],
];

const TARGET_MODELS = [
  "claude-3.5-sonnet", "claude-sonnet-4", "claude-sonnet-4.5", "deepseek-v3",
  "gemini-2.5-flash", "gemini-3-pro", "gemma-3-4b", "glm-4.6", "glm-4.7",
  "gpt-4o", "gpt-5.1", "gpt-oss-120b", "gpt-oss-20b", "grok-4", "kimi-k2.5",
  "kimi-k2", "llama-3.1-405b", "llama-3.1-70b", "llama-3.1-8b", "nova-pro",
  "phi-4", "phi-4-mini", "qwen-2.5-72b", "qwen3-235b",
];

export interface CoverageRow {
  id: string;
  name: string;
  vendor: string;
  size: string;
  sizeLabel: string;
  n: number;
  scores: Array<number | null>;
}

export interface CoverageData {
  benches: string[];
  rows: CoverageRow[];
  colMin: number[];
  colMax: number[];
}

export async function buildCoverageDataBrowser(): Promise<CoverageData> {
  const scores = await loadAllScoresBrowser();
  const ids = COVERAGE_BENCH.map(([id]) => id);
  const targetIds = new Set(TARGET_MODELS);
  const byModel = new Map<string, Record<string, number>>();

  for (const score of scores) {
    if (!ids.includes(score.benchmark_id)) continue;
    if (!targetIds.has(score.model_id)) continue;
    let bucket = byModel.get(score.model_id);
    if (!bucket) {
      bucket = {};
      byModel.set(score.model_id, bucket);
    }
    bucket[score.benchmark_id] = score.score;
  }

  const rows: CoverageRow[] = [];
  for (const modelId of TARGET_MODELS) {
    const model = modelById.get(modelId);
    if (!model) continue;
    const raw = byModel.get(modelId) ?? {};
    const rowScores = ids.map((id) => (id in raw ? Math.round(raw[id] * 10) / 10 : null));
    rows.push({
      id: modelId,
      name: model.name,
      vendor: model.vendor,
      size: sizeClass(model).key,
      sizeLabel: sizeLabel(model) ?? "",
      n: rowScores.filter((score) => score != null).length,
      scores: rowScores,
    });
  }

  const colMin = ids.map(() => Infinity);
  const colMax = ids.map(() => -Infinity);
  for (const row of rows) {
    row.scores.forEach((score, index) => {
      if (score == null) return;
      colMin[index] = Math.min(colMin[index], score);
      colMax[index] = Math.max(colMax[index], score);
    });
  }

  return { benches: COVERAGE_BENCH.map(([, label]) => label), rows, colMin, colMax };
}
