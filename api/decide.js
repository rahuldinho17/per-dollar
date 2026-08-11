// GET /api/decide — the PerDollar decision feed (W33-05, formerly deferred FL-M07-04).
//
// Price Per Token's MCP serves an agent *data*. This serves a *decision*, and it is
// the only one that understands data residency:
//
//   curl ".../api/decide?task=code-fix&residency=eu-de"
//
// Deferred until a real consumer existed; ShopAgentic is that consumer.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decide, euHostModels, TASK_CLASSES } from "../router/engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
let pool = null;
function models() {
  if (!pool) {
    const base = JSON.parse(readFileSync(join(HERE, "prices.json"), "utf8")).models;
    let eu = [];
    try { eu = euHostModels(JSON.parse(readFileSync(join(HERE, "..", "data", "eu-hosts.json"), "utf8"))); }
    catch { /* EU dataset optional */ }
    pool = [...base, ...eu];
  }
  return pool;
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");
  const q = Object.fromEntries(new URL(req.url, "http://x").searchParams);

  if (!q.task) {
    return res.status(200).json({
      service: "perdollar-decide",
      what: "Given a task and your constraints, returns which model to run it on and why. Prices are human-verified; residency is a hard filter applied before cost.",
      usage: "GET /api/decide?task=code-fix&residency=eu-de",
      tasks: Object.keys(TASK_CLASSES),
      residency: {
        "eu-de": "must stay in Germany", eu: "anywhere in the EU",
        "eu-ok": "EU preferred, global endpoints acceptable", any: "no constraint",
      },
      also: { prices: "/api/prices.json", route: "/api/route" },
    });
  }

  const num = (v) => (v == null || v === "" ? undefined : Number(v));
  const out = decide({
    models: models(), task: q.task, residency: q.residency,
    tokensIn: num(q.tokens_in), tokensOut: num(q.tokens_out),
    available: q.available ? q.available.split(",") : undefined,
    minCapability: num(q.min_capability), cacheHitRate: num(q.cache_hit_rate) ?? 0,
    allowUnscored: q.allow_unscored === "true", excludeLegacy: q.exclude_legacy !== "false",
  });
  return res.status(out.error ? 400 : 200).json(out);
}
