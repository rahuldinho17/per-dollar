#!/usr/bin/env node
// PerDollar MCP server — dependency-free.
//
// Gives a coding agent three tools:
//   perdollar_route   — which model should run this task, and why
//   perdollar_report  — log what it actually cost vs the default model
//   perdollar_savings — the accumulated counterfactual saving
//
// This is the shape Ryan described: the agent consults the data itself, so model
// governance happens with no policy to police and no developer to nag.
//
// Install (Claude Code):
//   claude mcp add perdollar -- node /absolute/path/to/router/mcp-server.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decide, counterfactual, jobCost, planBudget, euHostModels, TASK_CLASSES } from "./engine.mjs";
import { record, summary, burn } from "./ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FEED_URL = process.env.PERDOLLAR_FEED || "https://per-dollar.vercel.app/feed/prices.json";
const LOCAL_FEED = join(HERE, "..", "feed", "prices.json");
const EU_HOSTS = join(HERE, "..", "data", "eu-hosts.json");
function withEuHosts(list) {
  try { return [...list, ...euHostModels(JSON.parse(readFileSync(EU_HOSTS, "utf8")))]; }
  catch { return list; }
}

let cache = null, cachedAt = 0;
async function models() {
  if (cache && Date.now() - cachedAt < 3600e3) return cache;
  try {
    const r = await fetch(FEED_URL, { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); cache = withEuHosts(j.models); cachedAt = Date.now(); return cache; }
  } catch { /* fall through to the bundled copy */ }
  if (existsSync(LOCAL_FEED)) { cache = withEuHosts(JSON.parse(readFileSync(LOCAL_FEED, "utf8")).models); cachedAt = Date.now(); return cache; }
  throw new Error("could not load the PerDollar price feed");
}

const TOOLS = [
  {
    name: "perdollar_route",
    description:
      "Choose the cheapest model capable enough for a task, using daily-verified prices and an independent capability index. Call this BEFORE starting work, then use the model it returns. Returns the pick, why, the runner-up, and what was excluded.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", enum: Object.keys(TASK_CLASSES),
          description: "task class; determines the capability floor and default token estimates" },
        tokens_in: { type: "number", description: "override the estimated input tokens with a real count" },
        tokens_out: { type: "number", description: "override the estimated output tokens" },
        available: { type: "array", items: { type: "string" },
          description: "model ids this team can actually reach; omit for all tracked models" },
        min_capability: { type: "number", description: "override the task's capability floor (0-61)" },
        cache_hit_rate: { type: "number", description: "0-1; agent loops re-read context, which changes the ranking" },
        allow_unscored: { type: "boolean", description: "include models with no published capability score" },
        exclude_legacy: { type: "boolean", description: "drop provider-deprecated models (default true)" },
        residency: { type: "string", enum: ["any", "eu-ok", "eu", "eu-de"],
          description: "data-residency requirement. 'eu-de' = must stay in Germany, 'eu' = anywhere in the EU, 'eu-ok' = EU preferred but global endpoints acceptable. Applied before cost: it is a compliance constraint, not a preference." },
      },
      required: ["task"],
    },
  },
  {
    name: "perdollar_report",
    description:
      "Record a completed task: which model ran it, which model you would otherwise have used, and the real token counts. Computes the counterfactual saving and appends it to a local ledger. Call this AFTER the work is done.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string" },
        used_id: { type: "string", description: "model that actually ran it" },
        default_id: { type: "string", description: "model you would have reached for by habit" },
        tokens_in: { type: "number" },
        tokens_out: { type: "number" },
        cache_hit_rate: { type: "number" },
        outcome: { type: "string", enum: ["success", "failure", "unknown"],
          description: "did the task actually succeed? tests passed / diff accepted / no retry needed. This is what turns the ledger into capability data — record it honestly or leave it unknown." },
        retries: { type: "number", description: "how many extra attempts the task needed" },
      },
      required: ["used_id", "default_id", "tokens_in", "tokens_out"],
    },
  },
  {
    name: "perdollar_budget",
    description:
      "Stay inside a monthly AI budget. Given the budget and expected volume, returns the MOST capable model that still fits — not the cheapest — and tightens automatically as the month's spend accumulates. Use this instead of perdollar_route when the team has an allocated budget.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", enum: Object.keys(TASK_CLASSES) },
        budget: { type: "number", description: "monthly budget in dollars" },
        volume: { type: "number", description: "expected jobs this month" },
        residency: { type: "string", enum: ["any", "eu-ok", "eu", "eu-de"] },
        allow_unscored: { type: "boolean" },
        cache_hit_rate: { type: "number" },
      },
      required: ["task", "budget", "volume"],
    },
  },
  {
    name: "perdollar_savings",
    description: "Summarise the accumulated saving: tasks routed, spent, what the default models would have cost, and a monthly projection.",
    inputSchema: { type: "object", properties: { since: { type: "string", description: "ISO date lower bound" } } },
  },
];

async function callTool(name, args = {}) {
  const ms = await models();
  if (name === "perdollar_route") {
    return decide({
      models: ms, task: args.task, tokensIn: args.tokens_in, tokensOut: args.tokens_out,
      available: args.available, minCapability: args.min_capability,
      cacheHitRate: args.cache_hit_rate ?? 0, allowUnscored: args.allow_unscored ?? false,
      excludeLegacy: args.exclude_legacy ?? true, residency: args.residency,
    });
  }
  if (name === "perdollar_report") {
    const cf = counterfactual({
      models: ms, usedId: args.used_id, defaultId: args.default_id,
      tokensIn: args.tokens_in, tokensOut: args.tokens_out, cacheHitRate: args.cache_hit_rate ?? 0,
    });
    if (cf.error) return cf;
    const rec = record({
      task: args.task || "unspecified", used_id: args.used_id, default_id: args.default_id,
      tokens_in: args.tokens_in, tokens_out: args.tokens_out,
      actual_cost: cf.used.cost, counterfactual_cost: cf.would_have_used.cost, saved: cf.saved,
      outcome: args.outcome && args.outcome !== "unknown" ? args.outcome : undefined,
      retries: args.retries,
    });
    return { ...cf, ledger: rec };
  }
  if (name === "perdollar_budget") {
    const state = burn({ budget: args.budget, volume: args.volume });
    return planBudget({
      models: ms, task: args.task, budget: args.budget, volume: args.volume,
      spentSoFar: state.spent, elapsedDays: state.elapsed_days, daysInMonth: state.days_in_month,
      residency: args.residency, allowUnscored: args.allow_unscored ?? false,
      cacheHitRate: args.cache_hit_rate ?? 0,
    });
  }
  if (name === "perdollar_savings") return summary({ since: args.since });
  return { error: `unknown tool ${name}` };
}

// ---- MCP stdio transport: newline-delimited JSON-RPC 2.0 --------------------
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    try {
      if (msg.method === "initialize") {
        send({ jsonrpc: "2.0", id: msg.id, result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "perdollar", version: "0.1.0" },
        }});
      } else if (msg.method === "tools/list") {
        send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
      } else if (msg.method === "tools/call") {
        const out = await callTool(msg.params?.name, msg.params?.arguments);
        send({ jsonrpc: "2.0", id: msg.id, result: {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          isError: !!out.error,
        }});
      } else if (msg.id != null) {
        send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `unknown method ${msg.method}` } });
      }
    } catch (e) {
      if (msg.id != null) send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(e.message || e) } });
    }
  }
});
