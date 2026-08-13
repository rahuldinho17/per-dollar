#!/usr/bin/env node
// PerDollar CLI — the same engine, for humans and scripts.
//   node router/cli.mjs route code-fix --available opus5,haiku45,gem3f --allow-unscored
//   node router/cli.mjs report --task code-fix --used gem3f --default opus5 --in 9000 --out 1100
//   node router/cli.mjs savings

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decide, counterfactual, planBudget, euHostModels, TASK_CLASSES } from "./engine.mjs";
import { record, summary, reset, burn } from "./ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FEED = join(HERE, "..", "api", "prices.json");
const EU = join(HERE, "..", "data", "eu-hosts.json");
const models = () => {
  const base = JSON.parse(readFileSync(FEED, "utf8")).models;
  try { return [...base, ...euHostModels(JSON.parse(readFileSync(EU, "utf8")))]; }
  catch { return base; }
};

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes("--" + n);
const out = (o) => console.log(JSON.stringify(o, null, 2));

if (cmd === "route") {
  out(decide({
    models: models(), task: argv[1],
    tokensIn: flag("in") && +flag("in"), tokensOut: flag("out") && +flag("out"),
    available: flag("available") ? flag("available").split(",") : undefined,
    minCapability: flag("min-capability") ? +flag("min-capability") : undefined,
    cacheHitRate: flag("cache") ? +flag("cache") : 0,
    residency: flag("residency"),
    allowUnscored: has("allow-unscored"), excludeLegacy: !has("include-legacy"),
  }));
} else if (cmd === "budget") {
  const b = +flag("budget"), v = +flag("volume");
  const state = burn({ budget: b, volume: v });
  out(planBudget({
    models: models(), task: argv[1], budget: b, volume: v,
    spentSoFar: state.spent, elapsedDays: state.elapsed_days, daysInMonth: state.days_in_month,
    residency: flag("residency"), allowUnscored: has("allow-unscored"),
    cacheHitRate: flag("cache") ? +flag("cache") : 0,
  }));
} else if (cmd === "burn") {
  out(burn({ budget: flag("budget") ? +flag("budget") : undefined }));
} else if (cmd === "report") {
  const cf = counterfactual({ models: models(), usedId: flag("used"), defaultId: flag("default"),
    tokensIn: +flag("in"), tokensOut: +flag("out"), cacheHitRate: flag("cache") ? +flag("cache") : 0 });
  if (cf.error) { out(cf); process.exit(1); }
  const r = record({ task: flag("task", "unspecified"), used_id: flag("used"), default_id: flag("default"),
    tokens_in: +flag("in"), tokens_out: +flag("out"),
    actual_cost: cf.used.cost, counterfactual_cost: cf.would_have_used.cost, saved: cf.saved,
    outcome: flag("outcome"), retries: flag("retries") ? +flag("retries") : undefined });
  out({ ...cf, ledger: r });
} else if (cmd === "savings") {
  out(summary({ since: flag("since") }));
} else if (cmd === "reset") {
  out(reset());
} else {
  console.log(`PerDollar router

  route <task> [--residency eu-de|eu|eu-ok|any] [--available a,b]
               [--min-capability N] [--cache 0.8]
               [--allow-unscored] [--include-legacy] [--in N] [--out N]
  budget <task> --budget N --volume N [--residency eu-de] [--allow-unscored]
  burn [--budget N]
  report --used ID --default ID --in N --out N [--task NAME] [--outcome success|failure] [--retries N]
  savings [--since YYYY-MM-DD]
  reset

tasks: ${Object.keys(TASK_CLASSES).join(", ")}`);
}
