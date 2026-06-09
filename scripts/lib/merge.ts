import type { ScoreRecord, ScoreVariant, SourceKind } from "../../src/lib/types.ts";

const SOURCE_RANK: Record<SourceKind, number> = {
  tech_report: 5,
  arena_api: 4,
  alpaca_csv: 4,
  github_repo: 3,
  hf_dataset: 3,
  manual: 2,
};

function key(r: { model_id: string; benchmark_id: string }): string {
  return `${r.model_id}::${r.benchmark_id}`;
}

function normalizeConfig(c: string): string {
  return c.trim().toLowerCase().replace(/\s+/g, " ");
}

function variantsEqual(a: ScoreVariant, b: ScoreVariant): boolean {
  return (
    normalizeConfig(a.config) === normalizeConfig(b.config) &&
    a.score === b.score
  );
}

function toVariant(r: ScoreRecord): ScoreVariant {
  return { score: r.score, config: r.config, source: r.source };
}

function rankOf(r: ScoreRecord): number {
  return SOURCE_RANK[r.source.kind] ?? 0;
}

function pushUnique(variants: ScoreVariant[], v: ScoreVariant): ScoreVariant[] {
  if (variants.some((existing) => variantsEqual(existing, v))) return variants;
  return [...variants, v];
}

/**
 * Merge a new record into an existing one for the same (model, benchmark).
 *
 * Rule:
 *   - Same normalized config → newer source wins as primary; old primary
 *     (if substantively different) becomes a variant.
 *   - Different config → keep higher-source-rank entry as primary; demote
 *     the other to variants[]. Ties broken by recency.
 */
export function mergeOne(existing: ScoreRecord, incoming: ScoreRecord): ScoreRecord {
  const sameConfig =
    normalizeConfig(existing.config) === normalizeConfig(incoming.config);

  const existingVariants = existing.variants ?? [];

  if (sameConfig) {
    const incomingNewer = incoming.source.fetched_at > existing.source.fetched_at;
    const primary = incomingNewer ? incoming : existing;
    const demoted = incomingNewer ? existing : incoming;
    let variants = existingVariants;
    if (primary.score !== demoted.score) {
      variants = pushUnique(variants, toVariant(demoted));
    }
    return { ...primary, variants: variants.length ? variants : undefined };
  }

  const incomingRank = rankOf(incoming);
  const existingRank = rankOf(existing);
  const incomingWins =
    incomingRank > existingRank ||
    (incomingRank === existingRank &&
      incoming.source.fetched_at > existing.source.fetched_at);

  const primary = incomingWins ? incoming : existing;
  const demoted = incomingWins ? existing : incoming;
  const variants = pushUnique(existingVariants, toVariant(demoted));

  return { ...primary, variants };
}

/**
 * Fold a batch of new records into an existing list, applying mergeOne for
 * every (model_id, benchmark_id) collision.
 */
export function mergeScores(
  existing: ScoreRecord[],
  incoming: ScoreRecord[],
): ScoreRecord[] {
  const map = new Map<string, ScoreRecord>();
  for (const r of existing) map.set(key(r), r);
  for (const r of incoming) {
    const k = key(r);
    const prev = map.get(k);
    map.set(k, prev ? mergeOne(prev, r) : r);
  }
  return [...map.values()].sort((a, b) => {
    if (a.benchmark_id !== b.benchmark_id) {
      return a.benchmark_id.localeCompare(b.benchmark_id);
    }
    return b.score - a.score;
  });
}
