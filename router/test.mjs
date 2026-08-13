#!/usr/bin/env node
// Smoke tests for the router. Run: npm test
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decide, counterfactual, estimateCapability, jobCost, TASK_CLASSES } from "./engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const models = JSON.parse(readFileSync(join(HERE, "..", "feed", "prices.json"), "utf8")).models;
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

console.log("feed");
ok("models load", models.length > 20, `(${models.length})`);
ok("prices are positive", models.every(m => m.input_per_mtok > 0 && m.output_per_mtok > 0));
ok("verification present", models.every(m => m.verification));

console.log("decisions");
for (const t of Object.keys(TASK_CLASSES)) {
  const d = decide({ models, task: t });
  ok(`task ${t}`, !d.error && d.recommended?.cost_per_job > 0, JSON.stringify(d.error || ""));
}
ok("unknown task errors", !!decide({ models, task: "nope" }).error);
ok("respects available list", decide({ models, task: "summarize", available: ["haiku45"] }).recommended.id === "haiku45");
ok("excludes legacy by default", !decide({ models, task: "summarize" }).considered.some(c => models.find(m => m.id === c.id)?.legacy));
ok("higher floor never cheaper",
  decide({ models, task: "code-fix", minCapability: 58 }).recommended.cost_per_job >=
  decide({ models, task: "code-fix", minCapability: 45 }).recommended.cost_per_job);
ok("impossible constraint errors", !!decide({ models, task: "code-fix", minCapability: 99 }).error);
ok("warns when unscored excluded", decide({ models, task: "code-fix" }).warnings.length > 0);

console.log("cost maths");
const m = models.find(x => x.id === "opus48");
ok("cache lowers cost", jobCost(m, 10000, 500, 0.9) <= jobCost(m, 10000, 500, 0));
ok("more tokens cost more", jobCost(m, 20000, 500) > jobCost(m, 10000, 500));

console.log("counterfactual");
const cf = counterfactual({ models, usedId: "gem31fl", defaultId: "opus5", tokensIn: 9000, tokensOut: 1100 });
ok("saving is positive", cf.saved > 0, JSON.stringify(cf).slice(0, 80));
ok("saving pct sane", cf.saved_pct > 0 && cf.saved_pct < 100);
ok("unknown model errors", !!counterfactual({ models, usedId: "zzz", defaultId: "opus5", tokensIn: 1, tokensOut: 1 }).error);

console.log("capability estimation");
ok("third-party wins", estimateCapability(models.find(x => x.id === "opus5"), { siblings: models }).basis === "third-party");
ok("measured beats inference",
  estimateCapability(models.find(x => x.id === "gem3f"), { siblings: models, measured: { passRate: 0.9, samples: 50 } }).basis === "measured");
// Use a synthetic model, not a live one: this asserted against gem31fl, whose price
// moved from $0.40 to $1.50, leaving it legitimately bracketed by two scored models.
const floorPrice = Math.min(...models.filter(m => m.capability != null).map(m => m.output_per_mtok));
const cheap = estimateCapability(
  { id: "synthetic", provider: "test", input_per_mtok: floorPrice / 100, output_per_mtok: floorPrice / 100, capability: null },
  { siblings: models });
ok("never guesses high for a model cheaper than everything scored",
  cheap.score === null && cheap.basis === "unknown-cheap", JSON.stringify(cheap));

console.log("residency (T1.1)");
{
  const { euHostModels } = await import("./engine.mjs");
  const eu = JSON.parse(readFileSync(join(HERE, "..", "data", "eu-hosts.json"), "utf8"));
  const euModels = euHostModels(eu);
  ok("eu hosts load", euModels.length >= 5, `(${euModels.length})`);
  ok("eu hosts are tracked, never verified", euModels.every(m => m.verification === "tracked"));
  const all = [...models, ...euModels];
  const de = decide({ models: all, task: "product-copy", residency: "eu-de", allowUnscored: true });
  ok("eu-de returns a German host", !de.error && de.recommended.residency === "eu-de", JSON.stringify(de.error || de.recommended.residency));
  const anyR = decide({ models: all, task: "product-copy", residency: "any", allowUnscored: true });
  ok("residency never cheaper than unconstrained", de.recommended.cost_per_job >= anyR.recommended.cost_per_job);
  ok("no model satisfies eu-de without eu hosts", !!decide({ models, task: "product-copy", residency: "eu-de", allowUnscored: true }).error);
  ok("residency echoed in assumptions", decide({ models: all, task: "summarize", residency: "eu" }).assumptions.residency === "eu");
}

console.log("budget adherence (T1.3)");
{
  const { planBudget } = await import("./engine.mjs");
  const big = planBudget({ models, task: "agent-step", budget: 5000, volume: 1200, allowUnscored: true });
  const small = planBudget({ models, task: "agent-step", budget: 30, volume: 1200, allowUnscored: true });
  ok("large budget buys more capability",
    (big.recommended.capability ?? 0) >= (small.recommended.capability ?? 0),
    `${big.recommended.capability} vs ${small.recommended.capability}`);
  ok("picks best that fits, not cheapest", big.recommended.cost_per_job > small.recommended.cost_per_job);
  ok("reports fit", big.fits === true);
  const impossible = planBudget({ models, task: "agent-step", budget: 0.01, volume: 100000, allowUnscored: true });
  ok("impossible budget says so", impossible.fits === false && /over/.test(impossible.verdict));
  ok("still returns a fallback pick", !!impossible.recommended.id);
  const mid = planBudget({ models, task: "agent-step", budget: 50, volume: 1200,
    spentSoFar: 44, elapsedDays: 15, daysInMonth: 30, allowUnscored: true });
  ok("overspend lowers the ceiling", mid.budget.ceiling_per_job < small.budget.ceiling_per_job,
    `${mid.budget.ceiling_per_job} vs ${small.budget.ceiling_per_job}`);
  ok("pacing reported", mid.pacing && /%/.test(mid.pacing.pace_vs_plan));
  ok("rejects missing budget", !!planBudget({ models, task: "agent-step" }).error);
  const eu = planBudget({ models: [...models], task: "agent-step", budget: 500, volume: 100,
    residency: "eu-de", allowUnscored: true });
  ok("residency respected in budget mode", !!eu.error || eu.recommended.residency === "eu-de");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
