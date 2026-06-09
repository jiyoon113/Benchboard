import type { ScoreRecord } from "../../src/lib/types.ts";
import { readJson, writeJson } from "./io.ts";
import { scoresPath } from "./paths.ts";
import { mergeScores } from "./merge.ts";
import { flushUnresolved } from "./normalize.ts";

/**
 * Common wrapper: load existing scores for a source, merge incoming, write back.
 * Every fetcher script wraps its 50 LOC of source-specific work in this.
 */
export async function persist(
  sourceId: string,
  incoming: ScoreRecord[],
): Promise<void> {
  const file = scoresPath(sourceId);
  const existing = await readJson<ScoreRecord[]>(file, []);
  const merged = mergeScores(existing, incoming);
  await writeJson(file, merged);
  flushUnresolved(sourceId);
  console.log(
    `[${sourceId}] wrote ${merged.length} records (${incoming.length} incoming).`,
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}
