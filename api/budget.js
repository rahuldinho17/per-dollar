// GET /api/budget — stay inside a monthly AI budget (T1.3).
//
//   curl ".../api/budget?task=agent-step&budget=500&volume=1200"
//
// Every other router minimises cost. This spends an allocation well: the most
// capable model whose projected month still fits. Stateless — pass spent_so_far
// from your own ledger and the ceiling tightens accordingly.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { planBudget, euHostModels, TASK_CLASSES } from "../router/engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
let pool = null;
function models() {
  if (!pool) {
    const base = JSON.parse(readFileSync(join(HERE, "..", "feed", "prices.json"), "utf8")).models;
    let eu = [];
    try { eu = euHostModels(JSON.parse(readFileSync(join(HERE, "..", "data", "eu-hosts.json"), "utf8"))); } catch {}
    pool = [...base, ...eu];
  }
  return pool;
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");
  const q = Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const n = (v) => (v == null || v === "" ? undefined : Number(v));

  if (!q.task || !q.budget || !q.volume) {
    return res.status(200).json({
      service: "perdollar-budget",
      what: "Given a monthly budget and expected volume, returns the most capable model that fits — and tightens as spend accumulates.",
      usage: "GET /api/budget?task=agent-step&budget=500&volume=1200",
      params: { task: Object.keys(TASK_CLASSES), budget: "dollars per month", volume: "jobs per month",
        spent_so_far: "optional, from your ledger", elapsed_days: "optional, for pacing",
        residency: "any | eu-ok | eu | eu-de" },
    });
  }

  const out = planBudget({
    models: models(), task: q.task, budget: n(q.budget), volume: n(q.volume),
    spentSoFar: n(q.spent_so_far) ?? 0, elapsedDays: n(q.elapsed_days) ?? 0,
    daysInMonth: n(q.days_in_month) ?? 30, residency: q.residency,
    allowUnscored: q.allow_unscored !== "false", cacheHitRate: n(q.cache_hit_rate) ?? 0,
  });
  return res.status(out.error ? 400 : 200).json(out);
}
