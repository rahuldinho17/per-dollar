// Daily automatic price check. No human is in the loop.
//
// Runs straight after the OpenRouter refresh. For every model, every day, it
// records the date it checked (checked_at) and one of two results:
//
//   confirmed    today's price was found by the bot — on the provider's own
//                pricing page (check_source "provider-page"), or, when that page
//                can't be read, as the price OpenRouter lists (check_source
//                "openrouter")
//   unconfirmed  the bot checked but could not confirm it; check_note says why
//                and confirmed_at says when it last was confirmed
//
// Rules:
//   1. Silence is not consent. A page that can't be parsed is "unconfirmed",
//      never "confirmed".
//   2. The page never edits a price by guesswork. The one thing it may apply is
//      a large move the refresh parked (pending_price) — and only when the
//      provider's own page shows that exact new price beside the model name.
//   3. Dates come from the clock of the machine running the check.
//
//   node scripts/verify-agent.mjs            # check everything, write results
//   node scripts/verify-agent.mjs --dry      # report only
//   node scripts/verify-agent.mjs --id gpt55 # one model

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writePublicFeed } from "./feed.mjs";

const ROOT = process.env.DATA_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const PRICES = join(ROOT, "data", "prices.json");
const CHANGELOG = join(ROOT, "data", "changelog.json");
const today = new Date().toISOString().slice(0, 10);

const DRY = process.argv.includes("--dry");
const ONLY = process.argv.includes("--id") ? process.argv[process.argv.indexOf("--id") + 1] : null;

// Where each model's price is published, and the name it goes by on that page.
// `aliases` matter: pages rarely use our display name.
const ANTHROPIC = "https://platform.claude.com/docs/en/about-claude/pricing";
export const SOURCES = {
  gpt56sol:  { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.6-sol", "gpt-5.6 sol"] },
  gpt56ter:  { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.6-terra", "gpt-5.6 terra"] },
  gpt56lun:  { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.6-luna", "gpt-5.6 luna"] },
  gpt55:     { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.5"] },
  gpt54:     { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.4"] },
  g41mini:   { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-4.1-mini", "gpt-4.1 mini"] },
  g41nano:   { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-4.1-nano", "gpt-4.1 nano"] },
  opus5:     { url: ANTHROPIC, aliases: ["claude opus 5", "opus 5"] },
  opus48:    { url: ANTHROPIC, aliases: ["claude opus 4.8", "opus 4.8"] },
  fable5:    { url: ANTHROPIC, aliases: ["claude fable 5", "fable 5"] },
  son5:      { url: ANTHROPIC, aliases: ["claude sonnet 5", "sonnet 5"] },
  son46:     { url: ANTHROPIC, aliases: ["claude sonnet 4.6", "sonnet 4.6"] },
  haiku45:   { url: ANTHROPIC, aliases: ["claude haiku 4.5", "haiku 4.5"] },
  gem31p:    { url: "https://ai.google.dev/gemini-api/docs/pricing",    aliases: ["gemini 3.1 pro"] },
  gem36f:    { url: "https://ai.google.dev/gemini-api/docs/pricing",    aliases: ["gemini 3.6 flash"] },
  gem3f:     { url: "https://ai.google.dev/gemini-api/docs/pricing",    aliases: ["gemini 3 flash"] },
  gem31fl:   { url: "https://ai.google.dev/gemini-api/docs/pricing",    aliases: ["gemini 3.1 flash-lite", "gemini 3.1 flash lite"] },
  dsv4f:     { url: "https://api-docs.deepseek.com/quick_start/pricing", aliases: ["deepseek-v4-flash", "v4-flash"] },
  dsv4pro:   { url: "https://api-docs.deepseek.com/quick_start/pricing", aliases: ["deepseek-v4-pro", "v4-pro"] },
  glm52:     { url: "https://docs.z.ai/guides/overview/pricing",        aliases: ["glm-5.2", "glm 5.2"] },
  mm3:       { url: "https://www.minimax.io/price",                     aliases: ["minimax-m3", "m3"] },
  kimik3:    { url: "https://platform.moonshot.ai/docs/pricing",        aliases: ["kimi-k3", "kimi k3"] },
  grok45:    { url: "https://docs.x.ai/docs/models",                    aliases: ["grok-4.5", "grok 4.5"] },
  grok46:    { url: "https://docs.x.ai/docs/models",                    aliases: ["grok-4.6", "grok 4.6"] },
  gem37f:    { url: "https://ai.google.dev/gemini-api/docs/pricing",    aliases: ["gemini 3.7 flash"] },
  inkling:   { url: "https://thinkingmachines.ai/inkling/",             aliases: ["inkling"] },
};

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

/** Every price-looking number on the page, normalised. */
function pricesOn(text) {
  const out = new Set();
  for (const m of text.matchAll(/\$\s?([0-9]+(?:\.[0-9]+)?)/g)) out.add(Number(m[1]));
  return out;
}

/** Text within `window` chars of any alias — where a model's own prices live. */
function nearAlias(text, aliases, window = 600) {
  const lower = text.toLowerCase();
  const chunks = [];
  for (const a of aliases) {
    let i = 0;
    while ((i = lower.indexOf(a.toLowerCase(), i)) !== -1) {
      chunks.push(text.slice(Math.max(0, i - 120), i + window));
      i += a.length;
      if (chunks.length > 8) break;
    }
  }
  return chunks.join(" ");
}

const close = (a, b) => Math.abs(a - b) < Math.max(0.0001, b * 0.005);

/** Decide what the page says about one model. Never returns a price to write. */
export function assess(model, pageText, aliases) {
  if (!pageText || pageText.length < 200)
    return { status: "flagged", why: "page did not load or returned no readable text" };

  const scope = nearAlias(pageText, aliases);
  if (!scope)
    return { status: "flagged", why: `model name not found on the page — it may be renamed, moved, or the page is JavaScript-rendered` };

  const near = pricesOn(scope);
  const inFound = [...near].some((v) => close(v, model.inP));
  const outFound = [...near].some((v) => close(v, model.outP));

  if (inFound && outFound)
    return { status: "agent-verified", why: `both $${model.inP} and $${model.outP} found beside the model name` };

  if (!near.size)
    return { status: "flagged", why: "model name found but no prices near it — the page is probably rendered client-side" };

  const seen = [...near].filter((v) => v > 0 && v < 1000).sort((a, b) => a - b).slice(0, 8);
  return { status: "flagged",
    why: `page shows ${seen.map((v) => "$" + v).join(", ")} near the model name; we publish $${model.inP}/$${model.outP}` +
         `${inFound ? " (input matched, output did not)" : outFound ? " (output matched, input did not)" : ""}` };
}

async function fetchPage(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "PerDollar-verify/1.0 (+https://per-dollar.vercel.app)", Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { text: "", err: `HTTP ${r.status}` };
    return { text: strip(await r.text()) };
  } catch (e) { return { text: "", err: String(e.message || e).slice(0, 80) }; }
}

const OPENROUTER = "https://openrouter.ai/api/v1/models";
const RETIRED = ["verified_at", "agent_checked_at", "agent_status", "agent_note", "tracked_at", "promo_verified_at"];

/** Does what OpenRouter listed today match our standard (or current promo) price? */
function openRouterAgrees(model) {
  const o = model.or_check;
  if (!o || o.date !== today || !o.listed || o.inP == null || o.outP == null) return false;
  const std = close(o.inP, model.inP) && close(o.outP, model.outP);
  const promo = model.promoIn != null && close(o.inP, model.promoIn) && close(o.outP, model.promoOut ?? model.outP);
  return std || promo;
}

export function decide(model, page, src) {
  const r = !src ? { status: "flagged", why: "no provider page configured for this model" }
    : page.err ? { status: "flagged", why: `provider page could not be fetched (${page.err})` }
    : assess(model, page.text, src.aliases);

  // A parked large move is applied only on the provider's own word.
  const pend = model.pending_price;
  if (pend && src && !page.err) {
    const cand = { inP: pend.inP ?? model.inP, outP: pend.outP ?? model.outP };
    if (assess(cand, page.text, src.aliases).status === "agent-verified")
      return { status: "confirmed", via: "provider-page", apply: cand, why: null };
  }
  if (r.status === "agent-verified") return { status: "confirmed", via: "provider-page", why: null };
  if (!pend && openRouterAgrees(model))
    return { status: "confirmed", via: "openrouter", why: `not confirmed on the provider page (${r.why}); price matches OpenRouter's listing` };
  const orNote = model.or_check?.date === today
    ? (model.or_check.listed ? `; OpenRouter lists $${model.or_check.inP}/$${model.or_check.outP}` : "; not listed on OpenRouter")
    : "";
  const pendNote = pend ? `; a move to $${pend.inP ?? model.inP}/$${pend.outP ?? model.outP} is waiting for the provider page to show it` : "";
  return { status: "unconfirmed", via: null, why: r.why + orNote + pendNote };
}

async function main() {
  const prices = JSON.parse(readFileSync(PRICES, "utf8"));
  const changelog = JSON.parse(readFileSync(CHANGELOG, "utf8"));
  const pages = new Map();
  const results = [];

  for (const model of prices.models) {
    if (ONLY && model.id !== ONLY) continue;
    const src = SOURCES[model.id];
    if (src && !pages.has(src.url)) pages.set(src.url, await fetchPage(src.url));
    const page = src ? pages.get(src.url) : { text: "", err: "no source" };
    const d = decide(model, page, src);
    results.push({ id: model.id, ...d });
    if (DRY) continue;

    for (const k of RETIRED) delete model[k];
    const was = model.verification;

    if (d.apply) {
      for (const [dim, v] of Object.entries(d.apply)) if (model[dim] !== v) {
        changelog.push({ date: today, model: model.id, dimension: dim, old: model[dim], new: v,
          kind: v < model[dim] ? "cut" : "hike", source: "provider page (bot)" });
        model[dim] = v;
      }
      model.price_changed_at = today;
      delete model.pending_price;
      prices.last_change = today;
    }

    model.checked_at = today;
    model.verification = d.status;
    model.check_source = d.via;
    model.check_note = d.why;
    if (d.status === "confirmed") {
      model.confirmed_at = today;
      model.source = d.via === "provider-page" ? src.url : OPENROUTER;
    } else if (src) model.source = src.url;

    if (was !== d.status && (was === "confirmed" || d.status === "confirmed"))
      changelog.push({ date: today, model: model.id, kind: d.status === "confirmed" ? "confirmed" : "unconfirmed",
                       source: "daily price check", note: d.why || `confirmed via ${d.via}` });
  }

  if (!DRY) {
    prices.checked_at = today;
    delete prices.agent_swept_at; delete prices.verified_sweep;
    writeFileSync(PRICES, JSON.stringify(prices, null, 2) + "\n");
    writeFileSync(CHANGELOG, JSON.stringify(changelog, null, 2) + "\n");
    writePublicFeed(prices, ROOT);
  }

  const ok = results.filter((r) => r.status === "confirmed");
  const bad = results.filter((r) => r.status !== "confirmed");
  const lines = [
    `Daily price check ${today}${DRY ? " (dry run)" : ""}`,
    `  confirmed: ${ok.length}/${results.length}` +
      ` (provider page ${ok.filter((r) => r.via === "provider-page").length}, OpenRouter ${ok.filter((r) => r.via === "openrouter").length})`,
    ...(bad.length ? [`  not confirmed: ${bad.length}`, ...bad.map((f) => `    ${f.id.padEnd(9)} ${f.why}`)] : []),
  ];
  console.log("\n" + lines.join("\n") + "\n");
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + lines.join("\n") + "\n```\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("price check failed:", e.message); process.exit(1); });
