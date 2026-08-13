// GET/POST /api/route — the PerDollar decision endpoint (B1).
//
//   curl "https://per-dollar.vercel.app/api/route?task=code-fix"
//   curl -X POST https://per-dollar.vercel.app/api/route \
//        -H 'content-type: application/json' \
//        -d '{"task":"agent-step","available":["opus5","haiku45","gem3f"],"cache_hit_rate":0.8}'
//
// Stateless by design: it decides, it does not store. The counterfactual ledger
// lives on the caller's machine (router/ledger.mjs), so token counts and task
// names never leave it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decide, TASK_CLASSES } from "../router/engine.mjs";

// Resolve relative to this module, not process.cwd() — the working directory of a
// serverless function is not guaranteed to be the repo root.
const HERE = dirname(fileURLToPath(import.meta.url));
let feed = null;
function models() {
  if (!feed) feed = JSON.parse(readFileSync(join(HERE, "..", "feed", "prices.json"), "utf8"));
  return feed.models;
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = req.method === "POST"
    ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}))
    : Object.fromEntries(new URL(req.url, "http://x").searchParams);

  if (!q.task) {
    return res.status(200).json({
      service: "perdollar-route",
      usage: "GET /api/route?task=code-fix  |  POST with a JSON body",
      tasks: Object.fromEntries(Object.entries(TASK_CLASSES).map(([k, v]) =>
        [k, { min_capability: v.minCapability, needs: v.why }])),
      options: {
        available: "array of model ids this team can reach",
        min_capability: "override the task floor (0-61)",
        cache_hit_rate: "0-1; changes the ranking on context-heavy work",
        allow_unscored: "include models with no published capability score",
        exclude_legacy: "drop provider-deprecated models (default true)",
        residency: "any | eu-ok | eu | eu-de — data-residency requirement, applied before cost",
        tokens_in: "real input token count, overrides the task estimate",
        tokens_out: "real output token count",
      },
      prices: "/api/prices.json",
    });
  }

  const num = (v) => (v == null || v === "" ? undefined : Number(v));
  const bool = (v, d) => (v == null || v === "" ? d : String(v) === "true" || v === true);
  const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : undefined);

  const out = decide({
    models: models(),
    task: q.task,
    tokensIn: num(q.tokens_in),
    tokensOut: num(q.tokens_out),
    available: list(q.available),
    minCapability: num(q.min_capability),
    cacheHitRate: num(q.cache_hit_rate) ?? 0,
    allowUnscored: bool(q.allow_unscored, false),
    excludeLegacy: bool(q.exclude_legacy, true),
    requireVerified: bool(q.require_verified, false),
    residency: q.residency,
  });

  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(out.error ? 400 : 200).json(out);
}
