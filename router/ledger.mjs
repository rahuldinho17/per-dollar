// PerDollar savings ledger (B2).
//
// Every routed task records what it cost and what the developer's habitual model
// would have cost. Aggregate that and you have ROI the product proves about
// itself — no A/B test, no eval harness, no Jira integration.
//
// The ledger is a local JSON file. Deliberate: token counts and task names are
// the customer's data, and a pilot lands far more easily when nothing leaves the
// machine. Aggregates can be shared later by choice.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const DIR = process.env.PERDOLLAR_HOME || join(homedir(), ".perdollar");
const LEDGER = join(DIR, "ledger.json");

function load() {
  if (!existsSync(LEDGER)) return { version: 1, entries: [] };
  try { return JSON.parse(readFileSync(LEDGER, "utf8")); }
  catch { return { version: 1, entries: [] }; }
}
function save(l) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");
}

export function record(entry) {
  const l = load();
  l.entries.push({ at: new Date().toISOString(), ...entry });
  save(l);
  return { recorded: true, total_entries: l.entries.length, ledger: LEDGER };
}

/**
 * Observed pass rate per model per task class — the capability data nobody else
 * has, because it comes from real work rather than a benchmark. Feed it back
 * into estimateCapability() and third-party scores stop being load-bearing.
 *
 * Outcome is whatever the caller can honestly observe: tests passed, the diff was
 * accepted, no retry was needed. A task with no outcome recorded is ignored
 * rather than counted as a success.
 */
export function passRates({ minSamples = 5 } = {}) {
  const l = load();
  const buckets = {};
  for (const e of l.entries) {
    if (e.outcome !== "success" && e.outcome !== "failure") continue;
    const k = `${e.used_id}::${e.task}`;
    const b = (buckets[k] ||= { model: e.used_id, task: e.task, samples: 0, passes: 0, retries: 0 });
    b.samples++;
    if (e.outcome === "success") b.passes++;
    b.retries += e.retries || 0;
  }
  return Object.values(buckets)
    .filter(b => b.samples >= minSamples)
    .map(b => ({ ...b, pass_rate: Math.round((b.passes / b.samples) * 100) / 100,
                 avg_retries: Math.round((b.retries / b.samples) * 100) / 100 }))
    .sort((a, b) => b.samples - a.samples);
}

export function summary({ since } = {}) {
  const l = load();
  let entries = l.entries;
  if (since) entries = entries.filter(e => e.at >= since);

  if (!entries.length) {
    return { entries: 0, note: "no routed tasks recorded yet", ledger: LEDGER };
  }

  const spent = entries.reduce((s, e) => s + (e.actual_cost || 0), 0);
  const would = entries.reduce((s, e) => s + (e.counterfactual_cost || 0), 0);
  const switched = entries.filter(e => e.used_id !== e.default_id);

  const byTask = {};
  for (const e of entries) {
    const t = (byTask[e.task] ||= { tasks: 0, spent: 0, would: 0 });
    t.tasks++; t.spent += e.actual_cost || 0; t.would += e.counterfactual_cost || 0;
  }
  const byModel = {};
  for (const e of entries) byModel[e.used_id] = (byModel[e.used_id] || 0) + 1;

  const days = Math.max(1,
    (Date.parse(entries[entries.length - 1].at) - Date.parse(entries[0].at)) / 864e5);

  return {
    period: { from: entries[0].at.slice(0, 10), to: entries[entries.length - 1].at.slice(0, 10), days: Math.round(days) },
    tasks_routed: entries.length,
    tasks_switched: switched.length,
    spent: r(spent),
    would_have_spent: r(would),
    saved: r(would - spent),
    saved_pct: would > 0 ? Math.round((1 - spent / would) * 100) : 0,
    projected_monthly_saving: r((would - spent) / days * 30),
    by_task: Object.fromEntries(Object.entries(byTask).map(([k, v]) =>
      [k, { tasks: v.tasks, spent: r(v.spent), saved: r(v.would - v.spent) }])),
    models_used: byModel,
    outcomes_recorded: entries.filter(e => e.outcome).length,
    observed_pass_rates: passRates(),
    caveats: [
      "counterfactual costs assume the same input tokens on the default model, with output scaled by its answer-length factor",
      "it does not account for a retry a weaker model might have needed — measure quality separately before trusting the total",
      "projection extrapolates the observed period linearly",
    ],
    ledger: LEDGER,
  };
}

export function reset() { save({ version: 1, entries: [] }); return { reset: true, ledger: LEDGER }; }

function r(v) { return Math.round(v * 1e4) / 1e4; }
