import { type ReactNode, useEffect, useMemo, useState } from "react";
import runs from "../../data/runs/index.json";
import axisSources from "../../data/axis_sources.json";
import axisWeights from "../../data/benchmark_axis_weights.json";
import axisLineage from "../../data/axis_lineage.json";
import subsetSelection from "../../data/subset_selection_results.json";
import modelShortlist from "../../data/model_shortlist.json";
import LeaderboardTable from "../../src/components/LeaderboardTable";
import TagExplorer from "../../src/components/TagExplorer";
import { vendorSwatch } from "../../src/lib/vendorColors";
import type { ExplorerData } from "../../src/lib/loadData";
import {
  buildCoverageDataBrowser,
  buildExplorerDataBrowser,
  buildTrendDataBrowser,
  buildViewBrowser,
  type CategorySlug,
  type CategoryView,
  type CoverageData,
  type CoverageRow,
  type TrendData,
  type TrendPoint,
} from "./data";
import {
  BUILDER_COPY,
  CAPABILITY_OPTIONS,
  DEFAULT_BENCHMARK_COUNT,
  DEFAULT_PLANNER_SOURCE_ID,
  DEFAULT_TARGET_AXIS_IDS,
  HERO_CTAS,
  KEY_CLAIM,
  LINEAGE_BADGE_CLASS,
  RECOMMENDATION_LABELS,
  WORKFLOW_STEPS,
  coverageBarWidth,
  metricBarWidth,
  metricLabel,
  pct,
  prettyId,
} from "../../src/lib/plannerDemo";

const run = runs[0];
const benchById = new Map(axisWeights.benchmarks.map((bench) => [bench.id, bench]));
const lineageByAxis = new Map(axisLineage.map((item) => [item.axis_id, item]));
const shortlistById = new Map(modelShortlist.rankings.map((row) => [row.model_id, row]));
const recommendationCards = Object.entries(modelShortlist.recommendations).map(([key, modelId]) => ({
  key,
  label: RECOMMENDATION_LABELS[key] ?? key,
  row: shortlistById.get(modelId),
}));

type Route = "builder" | "axes" | "scores" | "trends" | "coverage";

function routeFromPath(): Route {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path.endsWith("/axes")) return "axes";
  if (path.endsWith("/scores") || path.endsWith("/non-deterministic") || path.endsWith("/deterministic")) return "scores";
  if (path.endsWith("/trends")) return "trends";
  if (path.endsWith("/coverage")) return "coverage";
  return "builder";
}

function pathForRoute(route: Route): string {
  if (route === "builder") return "/Benchboard/";
  return `/Benchboard/${route}`;
}

function SectionTitle({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{eyebrow}</p>
      <h2 className="text-lg font-semibold text-neutral-950">{title}</h2>
      {note ? <p className="mt-1 text-xs leading-5 text-neutral-500">{note}</p> : null}
    </div>
  );
}

function MetricBar({ label, value, color = "bg-cyan-500", width }: { label: string; value: number; color?: string; width?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium capitalize text-neutral-600">{label}</span>
        <span className="tabular-nums text-neutral-500">{value.toFixed(value < 0.1 ? 3 : 2)}</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: width ?? metricBarWidth(value) }} />
      </div>
    </div>
  );
}

function PageHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h1 className="text-2xl font-bold tracking-tight text-neutral-950">{title}</h1>
      <p className="mt-1 text-sm leading-6 text-neutral-600">{desc}</p>
    </div>
  );
}

function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-neutral-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

function LoadingPanel({ label }: { label: string }) {
  return <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">Loading {label}...</div>;
}

function PendingPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-500">
      <div className="font-medium text-neutral-700">{title}</div>
      <p className="mt-1 leading-6">{body}</p>
    </div>
  );
}

function BuilderPage() {
  const [sourceId, setSourceId] = useState(DEFAULT_PLANNER_SOURCE_ID);
  const [selectedAxes, setSelectedAxes] = useState<string[]>([...DEFAULT_TARGET_AXIS_IDS]);
  const [benchmarkCount, setBenchmarkCount] = useState(DEFAULT_BENCHMARK_COUNT);
  const [costPenalty, setCostPenalty] = useState(25);
  const [subsetReady, setSubsetReady] = useState(false);

  const source = axisSources.find((item) => item.id === sourceId) ?? axisSources[0];
  const selectedResult = subsetSelection.results.find((item) => item.source_id === sourceId) ?? subsetSelection.results[0];
  const activeAxes = axisWeights.axes.filter((axis) => selectedAxes.includes(axis.id));

  const rankedBenchmarks = useMemo(() => {
    const axisSet = new Set(selectedAxes);
    const maxCost = Math.max(...axisWeights.benchmarks.map((bench) => bench.cost), 1);
    return axisWeights.benchmarks
      .map((bench) => {
        const axisValues = selectedAxes.map((axisId) => bench.weights[axisId] ?? 0);
        const relevance = axisValues.reduce((sum, value) => sum + value, 0) / Math.max(axisValues.length, 1);
        const coverageBreadth = Object.entries(bench.weights).filter(([axisId, value]) => axisSet.has(axisId) && value >= 0.5).length / Math.max(selectedAxes.length, 1);
        const costDrag = (costPenalty / 100) * (bench.cost / maxCost);
        const utility = relevance * 0.72 + coverageBreadth * 0.2 - costDrag * 0.08;
        return { bench, relevance, coverageBreadth, utility };
      })
      .filter((item) => item.relevance > 0.05)
      .sort((a, b) => {
        if (b.utility !== a.utility) return b.utility - a.utility;
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        return a.bench.cost - b.bench.cost;
      });
  }, [costPenalty, selectedAxes]);

  const selectedBenchmarkItems = subsetReady ? rankedBenchmarks.slice(0, benchmarkCount) : [];
  const selectedBenchmarks = selectedBenchmarkItems.map((item) => item.bench.id);
  const coverageScore = selectedBenchmarkItems.reduce((sum, item) => sum + item.relevance, 0) / Math.max(selectedBenchmarkItems.length, 1);
  const costEfficiency = selectedBenchmarkItems.reduce((sum, item) => sum + (1 - item.bench.cost / 3), 0) / Math.max(selectedBenchmarkItems.length, 1);
  const builderMetrics = {
    coverage_score: coverageScore,
    expected_predictive_utility: Math.min(0.98, coverageScore * 0.74 + Math.max(0, costEfficiency) * 0.16 + 0.08),
    relevance: coverageScore,
    redundancy_reduction: Math.min(0.95, 0.62 + selectedAxes.length * 0.07 + Math.min(benchmarkCount, 7) * 0.015),
    predictive_gain: Math.min(0.96, coverageScore * 0.82 + 0.08),
    cost_efficiency: Math.max(0.15, Math.min(0.95, costEfficiency)),
  };

  const weightedCoverage = useMemo(() => {
    return activeAxes.map((axis) => {
      const values = selectedBenchmarks.map((benchId) => benchById.get(benchId)?.weights[axis.id] ?? 0);
      const value = values.reduce((sum, item) => sum + item, 0) / Math.max(values.length, 1);
      return { axis, value };
    });
  }, [activeAxes, selectedBenchmarks]);

  function resetSubset() {
    setSubsetReady(false);
  }

  function toggleAxis(axisId: string) {
    resetSubset();
    setSelectedAxes((current) => {
      if (current.includes(axisId)) return current.length === 1 ? current : current.filter((id) => id !== axisId);
      return [...current, axisId].slice(-3);
    });
  }

  return (
    <>
      <section className="space-y-6">
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">{BUILDER_COPY.eyebrow}</p>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-950 md:text-4xl">{BUILDER_COPY.title}</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">{BUILDER_COPY.summary}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubsetReady(true)}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {HERO_CTAS.primary}
            </button>
            <a
              href={pathForRoute("scores")}
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-500"
            >
              {HERO_CTAS.secondary}
            </a>
            <a
              href={pathForRoute("axes")}
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-500"
            >
              {HERO_CTAS.tertiary}
            </a>
          </div>
          <p className="mt-3 text-xs leading-5 text-neutral-500">{KEY_CLAIM}</p>
        </div>

        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-[11px] font-semibold text-white">{index + 1}</span>
              <span className="leading-4">{step}</span>
            </li>
          ))}
        </ol>

        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="h-full rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-neutral-950">Target capability</h2>
                <p className="text-xs text-neutral-500">{BUILDER_COPY.demoPath}</p>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">{BUILDER_COPY.selectionPrinciple}</div>
                <button
                  type="button"
                  onClick={() => setSubsetReady(true)}
                  className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                >
                  Generate compact subset
                </button>
                <button
                  type="button"
                  onClick={resetSubset}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-500"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {CAPABILITY_OPTIONS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleAxis(id)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                    selectedAxes.includes(id) ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Axis source</span>
                <select
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                  value={sourceId}
                  onChange={(event) => {
                    setSourceId(event.target.value);
                    resetSubset();
                  }}
                >
                  {axisSources.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Benchmark count</span>
                <input
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  type="number"
                  value={benchmarkCount}
                  min={3}
                  max={7}
                  onChange={(event) => {
                    setBenchmarkCount(Math.max(3, Math.min(7, Number(event.target.value) || DEFAULT_BENCHMARK_COUNT)));
                    resetSubset();
                  }}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cost penalty</span>
                <input
                  className="w-full accent-emerald-600"
                  type="range"
                  value={costPenalty}
                  min={0}
                  max={60}
                  onChange={(event) => {
                    setCostPenalty(Number(event.target.value));
                    resetSubset();
                  }}
                />
                <span className="block text-xs text-neutral-500">{costPenalty}%</span>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
              <span className="text-xs text-neutral-500">
                {subsetReady ? `${selectedBenchmarks.length} benchmarks selected from ${rankedBenchmarks.length} matching candidates` : `${rankedBenchmarks.length} matching benchmark candidates`}
              </span>
              <span className="text-xs text-neutral-500">Top k is recomputed from target axes, cost penalty, and benchmark budget.</span>
            </div>
          </div>

          <aside className="flex h-full flex-col justify-between rounded-lg bg-neutral-950 p-4 text-white shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Selected source</p>
                  <h2 className="mt-1 text-xl font-semibold">{source.label}</h2>
                </div>
                <span className="rounded-md border border-white/15 px-2 py-1 text-xs text-neutral-300">{pct(source.confidence)} confidence</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-neutral-300">{source.description}</p>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div><div className="text-2xl font-semibold">{run.score_matrix_coverage.models}</div><div className="text-xs text-neutral-400">models</div></div>
              <div><div className="text-2xl font-semibold">{run.score_matrix_coverage.benchmarks}</div><div className="text-xs text-neutral-400">benchmarks</div></div>
              <div><div className="text-2xl font-semibold">{pct(run.score_matrix_coverage.density)}</div><div className="text-xs text-neutral-400">coverage</div></div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="border-t border-neutral-200 pt-5">
          <SectionTitle eyebrow="Axis explorer" title="Score-pattern axes for this target" />
          <div className="space-y-3">
            {activeAxes.map((axis) => {
              const lineage = lineageByAxis.get(axis.id);
              return (
                <article key={axis.id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-neutral-950">{axis.name}</h3>
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${LINEAGE_BADGE_CLASS[axis.lineage_status] ?? LINEAGE_BADGE_CLASS.unchanged}`}>{axis.lineage_status}</span>
                    <span className="text-xs text-neutral-500">stability {pct(axis.stability)}</span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-neutral-600">{axis.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {axis.related_benchmarks.map((benchId) => <span key={benchId} className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{benchById.get(benchId)?.name ?? prettyId(benchId)}</span>)}
                  </div>
                  {lineage ? <p className="mt-2 text-xs leading-5 text-neutral-500">{lineage.reason}</p> : null}
                </article>
              );
            })}
          </div>
        </div>

        <div className="border-t border-neutral-200 pt-5">
          <SectionTitle eyebrow="Benchmark coverage map" title="Why these benchmarks were selected" />
          {!subsetReady ? (
            <PendingPanel title="No subset selected yet" body="Generate a compact subset first, then Benchboard will show which selected benchmarks cover each target axis." />
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                      <th className="py-2 pl-3 pr-3 font-semibold">Benchmark</th>
                      {activeAxes.map((axis) => <th key={axis.id} className="px-2 py-2 font-semibold">{axis.name}</th>)}
                      <th className="px-2 py-2 font-semibold">Utility</th>
                      <th className="px-2 py-2 font-semibold">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBenchmarkItems.map(({ bench, utility }, index) => {
                      return (
                        <tr key={bench.id} className="border-b border-neutral-100 last:border-b-0">
                          <td className="py-3 pl-3 pr-3 font-medium text-neutral-900">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500">#{index + 1}</span>
                              <span>{bench.name}</span>
                            </div>
                          </td>
                          {activeAxes.map((axis) => {
                            const value = bench.weights[axis.id] ?? 0;
                            return <td key={axis.id} className="px-2 py-3"><div className="h-6 rounded bg-neutral-100"><div className="flex h-6 items-center rounded bg-emerald-500 px-2 text-[11px] font-medium text-white" style={{ width: coverageBarWidth(value) }}>{pct(value)}</div></div></td>;
                          })}
                          <td className="px-2 py-3 text-neutral-600 tabular-nums">{utility.toFixed(2)}</td>
                          <td className="px-2 py-3 text-neutral-600">{bench.cost.toFixed(1)}x</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {weightedCoverage.map(({ axis, value }) => <MetricBar key={axis.id} label={`${axis.name} coverage`} value={value} color="bg-emerald-500" />)}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-t border-neutral-200 pt-5">
          <SectionTitle eyebrow="Axis-based benchmark builder" title="Compact subset output" />
          {!subsetReady ? (
            <PendingPanel title="No subset selected yet" body="Choose target axes and budget above, then click Generate compact subset to create the benchmark set." />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {selectedBenchmarkItems.map(({ bench, utility }, index) => {
                  return <article key={bench.id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">pick {index + 1}</span><span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">utility {utility.toFixed(2)}</span></div><h3 className="mt-1 font-semibold text-neutral-950">{bench.name}</h3><p className="mt-2 text-xs leading-5 text-neutral-500">{bench.rationale}</p></article>;
                })}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {Object.entries(builderMetrics).map(([label, value]) => <MetricBar key={label} label={metricLabel(label)} value={Number(value)} />)}
              </div>
              <div className="mt-5 space-y-2">
                {rankedBenchmarks.slice(benchmarkCount, benchmarkCount + 2).map(({ bench, relevance }) => (
                  <p key={bench.id} className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                    Held out {bench.name}: relevance {pct(relevance)}, but lower top-k utility after cost and overlap balancing.
                  </p>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-neutral-200 pt-5">
          <SectionTitle eyebrow="Model shortlist" title="Ranking from the compact suite" />
          {!subsetReady ? (
            <PendingPanel title="No shortlist yet" body="The model shortlist is generated after the compact benchmark subset exists." />
          ) : (
            <>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              {recommendationCards.map(({ key, label, row }) => row ? (
                <div key={key} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{label}</div>
                  <div className="mt-1 font-semibold text-neutral-950">{row.model_name}</div>
                  <div className="text-xs text-neutral-500">{row.vendor} · ${row.cost_per_mtok.toFixed(1)}/M · regret {row.regret.toFixed(3)}</div>
                </div>
              ) : null)}
            </div>
            <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
              <table className="w-full min-w-[650px] border-collapse text-sm">
                <thead><tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500"><th className="py-2 pl-3 pr-3 font-semibold">Model</th><th className="px-2 py-2 font-semibold">Subset</th><th className="px-2 py-2 font-semibold">Full suite</th><th className="px-2 py-2 font-semibold">Cost</th><th className="px-2 py-2 font-semibold">Regret</th><th className="px-2 py-2 font-semibold">Recommendation</th></tr></thead>
                <tbody>{modelShortlist.rankings.map((row) => <tr key={row.model_id} className="border-b border-neutral-100 last:border-b-0"><td className="py-3 pl-3 pr-3"><div className="font-semibold text-neutral-950">{row.model_name}</div><div className="text-xs text-neutral-500">{row.vendor}</div></td><td className="px-2 py-3 text-neutral-700">#{row.subset_rank} / {row.subset_score.toFixed(1)}</td><td className="px-2 py-3 text-neutral-700">#{row.full_suite_rank} / {row.full_suite_score.toFixed(1)}</td><td className="px-2 py-3 text-neutral-700">${row.cost_per_mtok.toFixed(1)}/M</td><td className="px-2 py-3 text-neutral-700">{row.regret.toFixed(3)}</td><td className="px-2 py-3"><span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">{row.recommendation}</span></td></tr>)}</tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </section>

      <section className="mt-8 border-t border-neutral-200 pt-5">
        <SectionTitle eyebrow="Run provenance" title="Guardrails and coverage" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs uppercase tracking-wide text-neutral-500">Run id</dt><dd className="mt-1 break-words font-medium text-neutral-900">{run.run_id}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-neutral-500">Condition</dt><dd className="mt-1 text-neutral-700">{run.condition}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-neutral-500">Selected source</dt><dd className="mt-1 text-neutral-700">{source.label}</dd></div>
          </dl>
          {!subsetReady ? (
            <PendingPanel title="No subset run selected" body="Guardrail notes appear after subset generation." />
          ) : (
            <div className="space-y-2">
              {selectedResult.reject_reasons.map((reason) => <p key={reason} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{reason}</p>)}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function AxesPage() {
  const [data, setData] = useState<ExplorerData | null>(null);

  useEffect(() => {
    let alive = true;
    buildExplorerDataBrowser().then((next) => {
      if (alive) setData(next);
    });
    return () => { alive = false; };
  }, []);

  return (
    <section>
      <PageHeader title="Benchmark axes" desc="Profiling ability tags and survey taxonomy for browsing which benchmarks exercise which capability axes." />
      <Surface>{data ? <TagExplorer data={data} topK={15} /> : <LoadingPanel label="axes" />}</Surface>
    </section>
  );
}

interface ScoreTab {
  id: CategorySlug;
  slug: string;
  label: string;
  note: string;
  group: "non-deterministic" | "deterministic" | "all";
  indent?: number;
  separator?: boolean;
}

const SCORE_CATEGORIES: ScoreTab[] = [
  { id: "non_deterministic", slug: "non-deterministic", label: "비결정적", group: "non-deterministic", note: "인간 선호도, LLM-as-judge, 시뮬레이션 기반 평가입니다." },
  { id: "nd_preference", slug: "nd-preference", label: "↳ Preference", group: "non-deterministic", indent: 1, note: "Chatbot Arena, AlpacaEval, Arena-Hard, WildBench 같은 preference / ELO 계열입니다." },
  { id: "nd_agent", slug: "nd-agent", label: "↳ Agent", group: "non-deterministic", indent: 1, note: "LLM 에이전트 시뮬레이션 기반 평가입니다." },
  { id: "nd_safety", slug: "nd-safety", label: "↳ Safety", group: "non-deterministic", indent: 1, note: "비결정적 safety / red-team 성격의 평가입니다." },
  { id: "nd_multilinguality", slug: "nd-multilinguality", label: "↳ Multiling.", group: "non-deterministic", indent: 1, note: "다국어 preference / judge 계열 평가입니다." },
  { id: "nd_korean", slug: "nd-korean", label: "↳ Korean", group: "non-deterministic", indent: 1, note: "한국어 비결정적 평가입니다." },
  { id: "deterministic", slug: "deterministic", label: "결정적", group: "deterministic", separator: true, note: "테크 리포트, 시스템 카드, 고정 벤치마크 기반 점수입니다." },
  { id: "general", slug: "general", label: "↳ General", group: "deterministic", indent: 1, note: "일반 지식/추론 계열 deterministic benchmark입니다." },
  { id: "math", slug: "math", label: "↳ Math/Sci", group: "deterministic", indent: 1, note: "수학, 과학, 정량 추론 benchmark입니다." },
  { id: "coding", slug: "coding", label: "↳ Coding", group: "deterministic", indent: 1, note: "코딩 및 코드 생성 benchmark입니다." },
  { id: "agent", slug: "agent", label: "↳ Agent", group: "deterministic", indent: 1, note: "툴 사용, SWE, 에이전트 태스크 benchmark입니다." },
  { id: "multimodal", slug: "multimodal", label: "↳ Multimodal", group: "deterministic", indent: 1, note: "비전/비디오를 포함한 멀티모달 benchmark 묶음입니다." },
  { id: "vision", slug: "vision", label: "↳↳ Vision", group: "deterministic", indent: 2, note: "이미지 이해 benchmark입니다." },
  { id: "video", slug: "video", label: "↳↳ Video", group: "deterministic", indent: 2, note: "비디오 이해 benchmark입니다." },
  { id: "multilinguality", slug: "multilinguality", label: "↳ Multiling.", group: "deterministic", indent: 1, note: "다국어 deterministic benchmark입니다." },
  { id: "korean", slug: "korean", label: "↳ Korean", group: "deterministic", indent: 1, note: "한국어 deterministic benchmark입니다." },
  { id: "all", slug: "all", label: "All", group: "all", separator: true, note: "전체 benchmark catalog입니다. 가장 무거운 테이블입니다." },
];

function ScoresPage() {
  const [category, setCategory] = useState<CategorySlug>("coding");
  const [view, setView] = useState<CategoryView | null>(null);
  const [loadedViews, setLoadedViews] = useState<Record<string, CategoryView>>({});
  const active = SCORE_CATEGORIES.find((item) => item.id === category) ?? SCORE_CATEGORIES[0];

  useEffect(() => {
    let alive = true;
    setView(null);
    buildViewBrowser(category).then((next) => {
      if (!alive) return;
      setView(next);
      setLoadedViews((current) => ({ ...current, [category]: next }));
    });
    return () => { alive = false; };
  }, [category]);

  function countFor(id: CategorySlug) {
    const cached = loadedViews[id];
    if (!cached) return "";
    return cached.benchmarks.length > 0 ? `${cached.rows.length}m·${cached.benchmarks.length}b` : "—";
  }

  return (
    <section>
      <PageHeader title="Scores" desc="비결정적 / 결정적 큰 그룹 안에서 원래 세부 카테고리별 score table을 볼 수 있습니다." />
      <Surface>
      <nav className="mb-5 border-b border-neutral-200">
        <ul className="flex gap-1 overflow-x-auto">
          {SCORE_CATEGORIES.map((item) => {
            const on = category === item.id;
            return (
              <li key={item.slug} className={item.separator ? "ml-3" : ""}>
                <button
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={`inline-flex items-baseline gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                    on ? "border-black font-semibold text-black" : "border-transparent text-neutral-600 hover:border-neutral-300 hover:text-black"
                  }`}
                >
                  <span className={item.indent === 2 ? "pl-3" : item.indent ? "pl-1" : ""}>{item.label}</span>
                  <span className={`text-[10px] tabular-nums ${on ? "text-neutral-500" : "text-neutral-400"}`}>{countFor(item.id)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="mb-4 text-sm text-neutral-500">{active.note}</p>
      {view ? <LeaderboardTable benchmarks={view.benchmarks} rows={view.rows} /> : <LoadingPanel label="scores" />}
      </Surface>
    </section>
  );
}

function dateToTime(date: string) { return new Date(date).getTime(); }
function fmtMonth(time: number) { const date = new Date(time); return `${date.toLocaleString("en", { month: "short" })} '${String(date.getFullYear()).slice(2)}`; }
function fmtYearMonth(time: number) { const date = new Date(time); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }

function trendline(points: Array<{ x: number; y: number }>) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const point of points) { sx += point.x; sy += point.y; sxy += point.x * point.y; sxx += point.x * point.x; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const xs = points.map((point) => point.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  return [{ x: x0, y: slope * x0 + intercept }, { x: x1, y: slope * x1 + intercept }];
}

function TrendsPage() {
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [benchmarkId, setBenchmarkId] = useState("");
  const [vendorLines, setVendorLines] = useState(false);
  const [hiddenVendors, setHiddenVendors] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    buildTrendDataBrowser(5).then((next) => {
      if (!alive) return;
      setTrend(next);
      const ids = Object.keys(next.names);
      setBenchmarkId(ids.includes("gpqa") ? "gpqa" : ids[0] ?? "");
    });
    return () => { alive = false; };
  }, []);

  const rows = benchmarkId && trend ? trend.data[benchmarkId] ?? [] : [];
  const vendors = [...new Set(rows.map((row) => row.vendor))].sort();
  const visiblePoints = rows.filter((row) => !hiddenVendors.has(row.vendor)).map((row) => ({ ...row, x: dateToTime(row.date), y: row.score }));
  const xMin = Math.min(dateToTime("2024-03-01"), ...visiblePoints.map((point) => point.x));
  const xMax = Math.max(Date.now(), ...visiblePoints.map((point) => point.x));
  const yMinRaw = Math.min(...visiblePoints.map((point) => point.y));
  const yMaxRaw = Math.max(...visiblePoints.map((point) => point.y));
  const yPad = Math.max(2, (yMaxRaw - yMinRaw) * 0.12 || 5);
  const yMin = Math.max(0, Math.floor((yMinRaw - yPad) / 10) * 10);
  const yMax = Math.min(100, Math.ceil((yMaxRaw + yPad) / 10) * 10 || 100);
  const line = trendline(visiblePoints);
  const plot = { left: 58, top: 20, width: 780, height: 320 };
  const sx = (x: number) => plot.left + ((x - xMin) / Math.max(1, xMax - xMin)) * plot.width;
  const sy = (y: number) => plot.top + plot.height - ((y - yMin) / Math.max(1, yMax - yMin)) * plot.height;

  return (
    <section>
      <PageHeader title="Benchmark trends" desc="Release-date scatterplots without Chart.js or Astro inline scripts. Toggle vendors and benchmark series directly in React." />
      {!trend ? <LoadingPanel label="trends" /> : (
        <Surface>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="text-sm text-neutral-600">Benchmark</label>
            <select className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm" value={benchmarkId} onChange={(event) => { setBenchmarkId(event.target.value); setHiddenVendors(new Set()); }}>
              {Object.keys(trend.names).map((id) => <option key={id} value={id}>{trend.names[id]}</option>)}
            </select>
            <label className="ml-2 flex items-center gap-1.5 text-sm text-neutral-600"><input type="checkbox" checked={vendorLines} onChange={(event) => setVendorLines(event.target.checked)} /> Vendor lines</label>
            {line ? <span className="ml-auto text-xs text-neutral-500">Trend: {line[0].y.toFixed(1)} to {line[1].y.toFixed(1)} ({fmtYearMonth(line[0].x)} to {fmtYearMonth(line[1].x)})</span> : null}
          </div>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-500">
            {vendors.map((vendor) => <button key={vendor} type="button" onClick={() => setHiddenVendors((current) => { const next = new Set(current); next.has(vendor) ? next.delete(vendor) : next.add(vendor); return next; })} className="flex items-center gap-1.5" style={{ opacity: hiddenVendors.has(vendor) ? 0.35 : 1 }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: vendorSwatch(vendor) }} />{vendor}</button>)}
          </div>
          <div className="rounded-md border border-neutral-200 bg-neutral-50/60 p-3">
            <svg viewBox="0 0 860 380" className="h-[430px] w-full" role="img" aria-label="Benchmark trend scatterplot">
              {[0, 1, 2, 3, 4].map((tick) => { const y = yMin + ((yMax - yMin) * tick) / 4; return <g key={tick}><line x1={plot.left} x2={plot.left + plot.width} y1={sy(y)} y2={sy(y)} stroke="rgba(136,135,128,0.16)" /><text x={plot.left - 10} y={sy(y) + 4} textAnchor="end" className="fill-neutral-500 text-[11px]">{y.toFixed(0)}</text></g>; })}
              {[0, 1, 2, 3, 4, 5].map((tick) => { const x = xMin + ((xMax - xMin) * tick) / 5; return <g key={tick}><line x1={sx(x)} x2={sx(x)} y1={plot.top} y2={plot.top + plot.height} stroke="rgba(136,135,128,0.10)" /><text x={sx(x)} y={plot.top + plot.height + 24} textAnchor="middle" className="fill-neutral-500 text-[11px]">{fmtMonth(x)}</text></g>; })}
              {line ? <line x1={sx(line[0].x)} y1={sy(line[0].y)} x2={sx(line[1].x)} y2={sy(line[1].y)} stroke="#888780" strokeWidth="2" strokeDasharray="6 5" /> : null}
              {vendorLines ? vendors.map((vendor) => { const pts = visiblePoints.filter((point) => point.vendor === vendor).sort((a, b) => a.x - b.x); if (pts.length < 2) return null; return <polyline key={vendor} points={pts.map((point) => `${sx(point.x)},${sy(point.y)}`).join(" ")} fill="none" stroke={vendorSwatch(vendor)} strokeWidth="1.5" opacity="0.75" />; }) : null}
              {visiblePoints.map((point) => <circle key={`${point.model}-${point.date}-${point.score}`} cx={sx(point.x)} cy={sy(point.y)} r="6" fill={vendorSwatch(point.vendor)} stroke="white" strokeWidth="1"><title>{point.model} - {point.score} ({fmtYearMonth(point.x)}, {point.vendor})</title></circle>)}
            </svg>
          </div>
        </Surface>
      )}
    </section>
  );
}

function heat(score: number | null, index: number, data: CoverageData) {
  if (score == null) return undefined;
  const lo = data.colMin[index], hi = data.colMax[index];
  const t = hi > lo ? (score - lo) / (hi - lo) : 1;
  return `rgba(22,163,74,${(0.07 + 0.5 * t).toFixed(3)})`;
}

function CoveragePage() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [size, setSize] = useState("all");
  const [minFilled, setMinFilled] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(-1);
  const [dir, setDir] = useState(-1);

  useEffect(() => { let alive = true; buildCoverageDataBrowser().then((next) => { if (alive) setData(next); }); return () => { alive = false; }; }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.rows
      .filter((row) => (size === "all" || row.size === size) && row.n >= minFilled && (!q || row.name.toLowerCase().includes(q) || row.vendor.toLowerCase().includes(q)))
      .sort((a, b) => {
        const av = sort === -1 ? a.n : a.scores[sort];
        const bv = sort === -1 ? b.n : b.scores[sort];
        if (av == null && bv == null) return a.name.localeCompare(b.name);
        if (av == null) return 1;
        if (bv == null) return -1;
        return -dir * (bv - av) || a.name.localeCompare(b.name);
      });
  }, [data, size, minFilled, query, sort, dir]);

  function toggleSort(index: number) {
    if (sort === index) setDir((current) => -current);
    else { setSort(index); setDir(-1); }
  }

  return (
    <section>
      <PageHeader title="Benchmark coverage" desc="React heatmap for target models across key benchmarks. Column headers sort without inline scripts." />
      {!data ? <LoadingPanel label="coverage" /> : <Surface>
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1"><span className="mr-1 text-neutral-500">Size</span>{["all", "small", "medium", "large"].map((item) => <button key={item} type="button" onClick={() => setSize(item)} className={`rounded border px-2 py-0.5 capitalize ${size === item ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300 text-neutral-600"}`}>{item}</button>)}</div>
          <label className="flex items-center gap-2"><span className="text-neutral-500">Min filled</span><input type="range" min={0} max={data.benches.length} value={minFilled} onChange={(event) => setMinFilled(Number(event.target.value))} className="w-32" /><span className="w-6 tabular-nums text-neutral-700">{minFilled}</span></label>
          <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="filter model / vendor..." className="w-48 rounded border border-neutral-300 px-2 py-1 text-sm" />
          <span className="ml-auto tabular-nums text-neutral-500">{rows.length}/{data.rows.length}</span>
        </div>
        <div className="overflow-x-auto rounded-md border border-neutral-200"><table className="min-w-full border-collapse text-xs"><thead><tr className="border-b border-neutral-200 bg-neutral-50"><th className="px-3 py-2 text-left font-medium text-neutral-500">Model</th><th onClick={() => toggleSort(-1)} className="cursor-pointer px-2 py-2 text-right font-medium text-neutral-500 hover:text-black">n{sort === -1 ? (dir < 0 ? " ▼" : " ▲") : ""}</th>{data.benches.map((bench, index) => <th key={bench} onClick={() => toggleSort(index)} className="cursor-pointer whitespace-nowrap px-1.5 py-2 text-right font-medium text-neutral-500 hover:text-black">{bench}{sort === index ? (dir < 0 ? " ▼" : " ▲") : ""}</th>)}</tr></thead><tbody>{rows.map((row: CoverageRow) => <tr key={row.id} className="border-b border-neutral-100 hover:bg-neutral-50"><td className="sticky left-0 bg-white px-3 py-1.5"><div className="font-medium text-neutral-900">{row.name}</div><div className="text-[10px] text-neutral-500">{row.vendor}{row.sizeLabel ? ` · ${row.sizeLabel}` : ""}</div></td><td className="px-2 py-1.5 text-right tabular-nums text-neutral-700">{row.n}</td>{row.scores.map((score, index) => <td key={index} className="px-1.5 py-1.5 text-right tabular-nums" style={{ background: heat(score, index, data) }}>{score == null ? <span className="text-neutral-300">.</span> : score}</td>)}</tr>)}</tbody></table></div>
      </Surface>}
    </section>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromPath);

  useEffect(() => {
    const syncRoute = () => setRoute(routeFromPath());
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("pageshow", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener("pageshow", syncRoute);
    };
  }, []);

  const nav = [
    ["builder", "Builder"],
    ["scores", "Scores"],
    ["trends", "Trends"],
    ["coverage", "Coverage"],
    ["axes", "Axes"],
  ] as const;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-5">
            <a href={pathForRoute("builder")} className="font-semibold tracking-tight">benchboard</a>
            <nav className="flex gap-3 text-sm">
              {nav.map(([id, label]) => (
                <a
                  key={id}
                  href={pathForRoute(id)}
                  className={route === id ? "text-neutral-950" : "text-neutral-600 hover:text-black"}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <span className="hidden text-xs text-neutral-500 sm:inline">Capability-targeted evaluation planner</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {route === "builder" ? <BuilderPage /> : null}
        {route === "axes" ? <AxesPage /> : null}
        {route === "scores" ? <ScoresPage /> : null}
        {route === "trends" ? <TrendsPage /> : null}
        {route === "coverage" ? <CoveragePage /> : null}
      </main>
    </div>
  );
}
