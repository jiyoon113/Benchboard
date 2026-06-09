/**
 * Fold data/_well-known-models.json into data/models.json. Idempotent —
 * unions aliases per model id without dropping anything.
 */
import path from "node:path";
import { readJson, writeJson } from "./lib/io.ts";
import { DATA_DIR, MODELS_PATH } from "./lib/paths.ts";
import type { Benchmark, Model } from "../src/lib/types.ts";
import { BENCHMARKS_PATH } from "./lib/paths.ts";

const MODEL_PACK = path.join(DATA_DIR, "_well-known-models.json");
const BENCH_PACK = path.join(DATA_DIR, "_well-known-benchmarks.json");

async function main() {
  const modelPack = await readJson<Model[]>(MODEL_PACK, []);
  const existingModels = await readJson<Model[]>(MODELS_PATH, []);
  const mmap = new Map(existingModels.map((m) => [m.id, m]));

  // Build alias→canonical_id index from pack so we can collapse seed duplicates.
  // e.g. "Gemini 2.5" is an alias of gemini-2.5-pro, so seed's "gemini-2.5" entry
  // should be merged into gemini-2.5-pro instead of kept as a separate entry.
  const aliasToCanonical = new Map<string, string>();
  for (const p of modelPack) {
    for (const a of p.aliases) {
      aliasToCanonical.set(a.toLowerCase(), p.id);
    }
  }

  // Remove entries from existing models whose id or name resolves to a different
  // canonical id in the pack (e.g. gemini-2.5 → gemini-2.5-pro).
  for (const m of existingModels) {
    const canonById = aliasToCanonical.get(m.id.toLowerCase());
    const canonByName = aliasToCanonical.get(m.name.toLowerCase());
    const canon = canonById ?? canonByName;
    if (canon && canon !== m.id) {
      // Merge aliases into canonical entry, then drop the duplicate.
      const canonical = mmap.get(canon);
      if (canonical) {
        canonical.aliases = Array.from(new Set([...canonical.aliases, ...m.aliases]));
      }
      mmap.delete(m.id);
    }
  }

  for (const p of modelPack) {
    const prev = mmap.get(p.id);
    mmap.set(p.id, {
      id: p.id,
      name: prev?.name ?? p.name,
      vendor: prev?.vendor ?? p.vendor,
      release_date: prev?.release_date ?? p.release_date,
      report_url: prev?.report_url ?? p.report_url,
      aliases: Array.from(new Set([...(prev?.aliases ?? []), ...p.aliases])),
    });
  }
  const modelsOut = [...mmap.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeJson(MODELS_PATH, modelsOut);

  const benchPack = await readJson<Benchmark[]>(BENCH_PACK, []);
  const existingBench = await readJson<Benchmark[]>(BENCHMARKS_PATH, []);
  const bmap = new Map(existingBench.map((b) => [b.id, b]));
  for (const p of benchPack) {
    const prev = bmap.get(p.id);
    // Pack values WIN for category/type/language — that's the point of
    // the pack: the user explicitly classified the benchmark. Everything
    // else keeps the existing (possibly auto-registered) value.
    // Pack is hand-curated, so all editorial fields it provides win.
    // Falls back to the existing value only when the pack omits the field.
    bmap.set(p.id, {
      id: p.id,
      name: p.name ?? prev?.name,
      category: p.category ?? prev?.category ?? "other",
      type: p.type ?? prev?.type ?? "deterministic",
      language: p.language ?? prev?.language,
      source_url: p.source_url ?? prev?.source_url,
      description: p.description ?? prev?.description,
      note: p.note ?? prev?.note,
    });
  }
  const benchOut = [...bmap.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeJson(BENCHMARKS_PATH, benchOut);

  console.log(
    `Models: ${modelsOut.length} entries. Benchmarks: ${benchOut.length} entries.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
