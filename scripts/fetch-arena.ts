/**
 * Chatbot Arena (LMArena) — pulls the daily-refreshed unofficial mirror
 * for the "text" leaderboard. Emits one ScoreRecord per ranked model with
 * benchmark_id "chatbot-arena", extra = {ci, votes, rank}.
 */
import { appendFile } from "node:fs/promises";
import type { ScoreRecord } from "../src/lib/types.ts";
import { persist, nowIso } from "./lib/fetcher.ts";
import { resolveModelId, recordUnresolved } from "./lib/normalize.ts";

const DATA_URL =
  "https://raw.githubusercontent.com/oolong-tea-2026/arena-ai-leaderboards/main/data";
const BENCHMARK_ID = "chatbot-arena";

interface ArenaRow {
  rank: number;
  model: string;
  vendor?: string;
  score: number;
  ci?: number;
  votes?: number;
}

async function main() {
  const latest = await fetch(`${DATA_URL}/latest.json`);
  if (!latest.ok) throw new Error(`Arena snapshot lookup failed: ${latest.status}`);
  const { path: snapshot } = (await latest.json()) as { path?: string };
  if (typeof snapshot !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) {
    throw new Error("Arena snapshot path is invalid");
  }
  const endpoint = `${DATA_URL}/${snapshot}/text.json`;
  const res = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  // The mirror sometimes publishes a date index without a text snapshot.
  if (res.status === 404) {
    const warning = `Arena: no text snapshot for ${snapshot}; existing scores retained (not refreshed).`;
    console.warn(warning);
    if (process.env.GITHUB_ACTIONS) console.warn(`::warning::${warning}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n- ${warning}\n`);
    }
    return;
  }
  if (!res.ok) throw new Error(`Arena fetch failed: ${res.status}`);
  const json = (await res.json()) as { models?: ArenaRow[] };
  const rows = json.models;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Arena snapshot has no models; keeping existing scores");
  }

  const fetched_at = nowIso();
  const records: ScoreRecord[] = [];
  for (const row of rows) {
    if (typeof row.model !== "string" || typeof row.score !== "number" || !Number.isFinite(row.score)) continue;
    const id = await resolveModelId(row.model);
    if (!id) {
      recordUnresolved(row.model);
      continue;
    }
    records.push({
      model_id: id,
      benchmark_id: BENCHMARK_ID,
      score: row.score,
      config: "default",
      source: { kind: "arena_api", url: endpoint, fetched_at },
      extra: { rank: row.rank, ci: row.ci, votes: row.votes },
    });
  }
  if (records.length === 0) throw new Error("Arena has no matched scores; keeping existing scores");
  await persist("arena", records);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
