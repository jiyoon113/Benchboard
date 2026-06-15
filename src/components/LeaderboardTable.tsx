import { useMemo, useState } from "react";
import type { Benchmark, Model, ScoreRecord } from "../lib/types";
import ScoreCell from "./ScoreCell";
import { withBase } from "../lib/url";
import { vendorBg, vendorSwatch } from "../lib/vendorColors";
import { sizeClass, sizeLabel, SIZE_ORDER } from "../lib/modelSize";

interface Row {
  model: Model;
  scores: Record<string, ScoreRecord>;
}

interface Props {
  benchmarks: Benchmark[];
  rows: Row[];
}

type SortKey = { kind: "model" } | { kind: "bench"; id: string };

export default function LeaderboardTable({ benchmarks, rows }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [sizeFilter, setSizeFilter] = useState<string>("");
  const [benchSearch, setBenchSearch] = useState("");
  const [sort, setSort] = useState<SortKey>(
    benchmarks[0] ? { kind: "bench", id: benchmarks[0].id } : { kind: "model" },
  );
  const [desc, setDesc] = useState(true);

  // List of all models that have at least one score in this view
  const vendors = useMemo(() => {
    const v = new Set<string>();
    for (const r of rows) v.add(r.model.vendor);
    return [...v].sort();
  }, [rows]);

  const visibleBenchmarks = useMemo(() => {
    const q = benchSearch.trim().toLowerCase();
    if (!q) return benchmarks;
    return benchmarks.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        (b.description?.toLowerCase().includes(q) ?? false),
    );
  }, [benchmarks, benchSearch]);

  // Size classes present in this view, in size order.
  const sizeClasses = useMemo(() => {
    const present = new Set(rows.map((r) => sizeClass(r.model).key));
    return SIZE_ORDER.filter((s) => present.has(s.key));
  }, [rows]);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (vendorFilter && r.model.vendor !== vendorFilter) return false;
      if (sizeFilter && sizeClass(r.model).key !== sizeFilter) return false;
      if (selected.size && !selected.has(r.model.id)) return false;
      return true;
    });
  }, [rows, vendorFilter, sizeFilter, selected]);

  const sorted = useMemo(() => {
    const copy = [...visibleRows];
    copy.sort((a, b) => {
      if (sort.kind === "model") {
        return a.model.name.localeCompare(b.model.name) * (desc ? -1 : 1);
      }
      const av = a.scores[sort.id]?.score;
      const bv = b.scores[sort.id]?.score;
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return (av - bv) * (desc ? -1 : 1);
    });
    return copy;
  }, [visibleRows, sort, desc]);

  function toggleSort(key: SortKey) {
    if (
      sort.kind === key.kind &&
      (sort.kind === "model" || sort.id === (key as { id: string }).id)
    ) {
      setDesc((d) => !d);
    } else {
      setSort(key);
      setDesc(true);
    }
  }

  function toggleModel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (benchmarks.length === 0) {
    return (
      <div className="rounded border border-neutral-200 p-4 text-sm text-neutral-500">
        No benchmarks in this category yet.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded border border-neutral-200 p-4 text-sm text-neutral-500">
        No scores ingested yet for this category. Run{" "}
        <code className="rounded bg-neutral-100 px-1">npm run fetch:all</code> or{" "}
        <code className="rounded bg-neutral-100 px-1">npm run ingest -- &lt;pdf&gt; &lt;model-id&gt;</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-3">
        <div className="flex items-center justify-end">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500 font-medium uppercase tracking-wide">Search</span>
            <input
              type="search"
              value={benchSearch}
              onChange={(e) => setBenchSearch(e.target.value)}
              placeholder="benchmark name…"
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs w-56 focus:outline-none focus:border-black"
            />
            {benchSearch && (
              <span className="text-neutral-400 tabular-nums">
                {visibleBenchmarks.length}/{benchmarks.length}
              </span>
            )}
          </label>
        </div>
        {vendors.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500 font-medium uppercase tracking-wide shrink-0">Vendor</span>
            <button
              type="button"
              onClick={() => setVendorFilter("")}
              className={
                "rounded px-2 py-0.5 border text-xs " +
                (vendorFilter === ""
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 hover:border-neutral-400")
              }
            >
              all
            </button>
            {vendors.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVendorFilter(v === vendorFilter ? "" : v)}
                className={
                  "inline-flex items-center gap-1.5 rounded px-2 py-0.5 border text-xs " +
                  (vendorFilter === v
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 hover:border-neutral-400")
                }
              >
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: vendorSwatch(v) }}
                  aria-hidden="true"
                />
                {v}
              </button>
            ))}
          </div>
        )}
        {sizeClasses.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500 font-medium uppercase tracking-wide shrink-0">Size</span>
            <button
              type="button"
              onClick={() => setSizeFilter("")}
              className={
                "rounded px-2 py-0.5 border text-xs " +
                (sizeFilter === ""
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 hover:border-neutral-400")
              }
            >
              all
            </button>
            {sizeClasses.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSizeFilter(s.key === sizeFilter ? "" : s.key)}
                className={
                  "rounded px-2 py-0.5 border text-xs " +
                  (sizeFilter === s.key
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 hover:border-neutral-400")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-start gap-2 text-xs">
          <span className="text-neutral-500 font-medium uppercase tracking-wide mt-1 shrink-0">
            Models
          </span>
          <div className="flex flex-wrap gap-1 flex-1">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded px-2 py-0.5 border border-neutral-300 hover:border-neutral-400 text-xs"
              >
                clear ({selected.size})
              </button>
            )}
            {rows
              .filter((r) => !vendorFilter || r.model.vendor === vendorFilter)
              .map((r) => {
                const on = selected.has(r.model.id);
                const scoreCount = Object.keys(r.scores).length;
                return (
                  <button
                    key={r.model.id}
                    type="button"
                    onClick={() => toggleModel(r.model.id)}
                    title={`${r.model.vendor} · ${scoreCount} score${scoreCount === 1 ? "" : "s"} in this view`}
                    className={
                      "rounded px-2 py-0.5 border text-xs " +
                      (on
                        ? "border-black bg-black text-white"
                        : "border-neutral-300 hover:border-neutral-400")
                    }
                  >
                    {r.model.name}{" "}
                    <span className={on ? "opacity-60" : "text-neutral-400"}>
                      ·{scoreCount}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
        <div className="text-xs text-neutral-500">
          Showing {sorted.length} of {rows.length} model{rows.length === 1 ? "" : "s"} ·{" "}
          {benchmarks.length} benchmark{benchmarks.length === 1 ? "" : "s"} in this category
          {selected.size > 0 && " · click selected chip to deselect"}
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-neutral-50 px-3 py-2 text-left font-semibold cursor-pointer select-none"
                onClick={() => toggleSort({ kind: "model" })}
              >
                Model{" "}
                {sort.kind === "model" && (
                  <span className="text-neutral-400">{desc ? "▼" : "▲"}</span>
                )}
              </th>
              {visibleBenchmarks.map((b) => (
                <th
                  key={b.id}
                  scope="col"
                  className="px-3 py-2 text-right font-semibold cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort({ kind: "bench", id: b.id })}
                  title={b.id}
                >
                  <a
                    href={withBase(`/benchmarks/${b.id}`)}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {b.name}
                  </a>{" "}
                  {sort.kind === "bench" && sort.id === b.id && (
                    <span className="text-neutral-400">{desc ? "▼" : "▲"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const bg = vendorBg(row.model.vendor);
              return (
              <tr
                key={row.model.id}
                className="border-t border-neutral-100"
                style={{ backgroundColor: bg }}
              >
                <td
                  className="sticky left-0 z-10 px-3 py-2"
                  style={{ backgroundColor: bg }}
                >
                  <a
                    href={withBase(`/models/${row.model.id}`)}
                    className="font-medium hover:underline"
                  >
                    {row.model.name}
                  </a>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: vendorSwatch(row.model.vendor) }}
                      aria-hidden="true"
                    />
                    {row.model.vendor}
                    {sizeLabel(row.model) && (
                      <span className="rounded bg-neutral-200/70 px-1 text-[10px] tabular-nums text-neutral-600">
                        {sizeLabel(row.model)}
                      </span>
                    )}
                  </div>
                </td>
                {visibleBenchmarks.map((b) => (
                  <td key={b.id} className="px-3 py-2 text-right">
                    <ScoreCell record={row.scores[b.id]} />
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
