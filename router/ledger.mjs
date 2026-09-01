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
  // Store the justification alongside the cost. "We saved $X" is a claim;
  // "here is every decision and why" is an audit trail — which is what a
  // sceptical CTO actually asks for. Borrowed from vLLM Semantic Router's
  // decision replay.
  l.entries.push({ at: new Date().toISOString(), ...entry });
  save(l);
  return { recorded: true, total_entries: l.entries.length, ledger: LEDGER };
}

/**
 * Accepted Work per Dollar.
 *
 * "Did the task succeed?" needs judgement and invites a model to grade its own
 * homework. "Did the task need doing again?" does not — a retry or an escalation
 * to a dearer model is an observable event, and it is the cheap, ungameable half
 * of the same question. So we never claim to measure success. We measure work
 * that did not need a do-over, and we report how much of the sample had any
 * observable signal at all.
 *
 * Signals, strongest first:
 *   tests_passed / tests_failed  objective, from the caller's own test run
 *   escalated                    the workflow fell back to a dearer model — the
 *                                cheaper one demonstrably did not finish the job
 *   retried                      the same task was attempted again
 *   committed / abandoned        the diff was kept or thrown away
 *   none                         no signal; excluded from the metric, counted in coverage
 */
const CLEAN = new Set(["tests_passed", "committed"]);
const DIRTY = new Set(["tests_failed", "escalated", "retried", "abandoned"]);

export function acceptedWorkPerDollar({ since, minSamples = 5 } = {}) {
  const l = load();
  const entries = (since ? l.entries.filter(e => e.at >= since) : l.entries);
  if (!entries.length) return { entries: 0, note: "no routed tasks recorded yet" };

  const signalled = entries.filter(e => CLEAN.has(e.signal) || DIRTY.has(e.signal) || (e.retries > 0));
  const clean = signalled.filter(e => CLEAN.has(e.signal) && !(e.retries > 0));
  const spentAll = entries.reduce((s, e) => s + (e.actual_cost || 0), 0);
  const spentSignalled = signalled.reduce((s, e) => s + (e.actual_cost || 0), 0);

  const byModel = {};
  for (const e of signalled) {
    const k = `${e.used_id}::${e.task}`;
    const b = (byModel[k] ||= { model: e.used_id, task: e.task, tasks: 0, clean: 0, spent: 0 });
    b.tasks++; b.spent += e.actual_cost || 0;
    if (CLEAN.has(e.signal) && !(e.retries > 0)) b.clean++;
  }

  return {
    // Coverage first: a metric computed on 3 of 400 tasks is not a metric.
    coverage: {
      tasks_routed: entries.length,
      with_observable_signal: signalled.length,
      pct: Math.round((signalled.length / entries.length) * 100),
      note: signalled.length < entries.length
        ? "tasks with no observable signal are excluded, not assumed successful"
        : "every task carried a signal",
    },
    accepted_work: clean.length,
    spent_on_signalled: r(spentSignalled),
    cost_per_accepted_task: clean.length ? r(spentSignalled / clean.length) : null,
    first_pass_rate: signalled.length ? Math.round((clean.length / signalled.length) * 100) : null,
    by_model: Object.values(byModel)
      .filter(b => b.tasks >= minSamples)
      .map(b => ({ ...b, spent: r(b.spent),
        first_pass_rate: Math.round((b.clean / b.tasks) * 100),
        cost_per_accepted_task: b.clean ? r(b.spent / b.clean) : null }))
      .sort((a, b) => a.tasks - b.tasks * -1),
    // Navigara's warning: "activity is exactly what inflates when work gets cheaper
    // to produce". Tasks are activity, so a team could improve this metric by
    // splitting work into smaller pieces. Report the denominator's shape so that
    // is visible rather than hidden.
    task_size: (() => {
      // Chronological for the trend, sorted only for the median — sorting first
      // would measure spread rather than change over time.
      const chron = signalled
        .map(e => ({ at: e.at, n: (e.tokens_in || 0) + (e.tokens_out || 0) }))
        .filter(x => x.n).sort((a, b) => a.at.localeCompare(b.at));
      if (!chron.length) return null;
      const sorted = chron.map(x => x.n).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
      const half = Math.floor(chron.length / 2);
      const earlier = chron.slice(0, half).map(x => x.n);
      const later = chron.slice(half).map(x => x.n);
      const pct = earlier.length && later.length
        ? Math.round((avg(later) / avg(earlier) - 1) * 100) : null;
      return {
        median_tokens: med,
        change_vs_earlier: pct == null ? null : (pct >= 0 ? "+" : "") + pct + "%",
        warning: pct != null && pct < -15
          ? "tasks are getting smaller — cost per accepted task will improve without the work getting cheaper. Do not quote the headline without this."
          : null,
        note: "tasks are activity; a shrinking denominator flatters the metric",
      };
    })(),
    caveats: [
      "measures work that did not need a do-over, not work that was correct — a wrong answer nobody retried counts as accepted",
      "tasks are activity: splitting work into smaller pieces improves this metric without improving anything. Read task_size alongside it",
      "only meaningful where a task has an observable outcome; summarisation, translation and copy generally do not",
      "a cheaper model that quietly produces worse output will look good here until someone checks the output itself",
    ],
    spent_total: r(spentAll),
  };
}

/**
 * Month-to-date burn against a budget (T1.3). Feeds planBudget so today's routing
 * decision reflects what the month has already cost.
 */
export function burn({ budget, volume, month } = {}) {
  const l = load();
  const m = month || new Date().toISOString().slice(0, 7);
  const entries = l.entries.filter(e => e.at.slice(0, 7) === m);
  const spent = entries.reduce((s, e) => s + (e.actual_cost || 0), 0);

  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsedDays = m === now.toISOString().slice(0, 7) ? now.getUTCDate() : daysInMonth;

  const out = { month: m, jobs: entries.length, spent: r(spent), elapsed_days: elapsedDays, days_in_month: daysInMonth };
  if (budget > 0) {
    const expected = budget * (elapsedDays / daysInMonth);
    const projected = elapsedDays > 0 ? spent / elapsedDays * daysInMonth : 0;
    out.budget = budget;
    out.pace_vs_plan = expected > 0 ? Math.round((spent / expected) * 100) + "%" : "n/a";
    out.projected_month_end = r(projected);
    out.projected_vs_budget = Math.round((projected / budget) * 100) + "%";
    out.status = projected > budget ? "over" : projected > budget * 0.9 ? "tight" : "on track";
    out.remaining = r(Math.max(0, budget - spent));
  }
  if (volume > 0) out.volume_assumed = volume;
  return out;
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
    decisions_with_reason: entries.filter(e => e.reason).length,
    outcomes_recorded: entries.filter(e => e.outcome).length,
    accepted_work_per_dollar: acceptedWorkPerDollar(),
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
