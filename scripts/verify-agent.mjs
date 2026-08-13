// Daily price verification agent.
//
// Runs after the price refresh. For each model it fetches the provider's own
// pricing page, looks for the price we publish, and records the result:
//
//   agent-verified  the exact price was found on the provider's own page today
//   flagged         the page loaded but the price could not be confirmed
//   verified        a human checked it — the agent NEVER overwrites this level
//
// Two rules make it trustworthy rather than merely convenient:
//   1. It can only ever CONFIRM. It never edits a price. A disagreement becomes a
//      flag for a human, never a silent update.
//   2. Silence is not consent. If the page cannot be parsed, that is "flagged",
//      not "verified" — the failure mode that would destroy the product is an
//      agent that marks things verified because it found nothing to contradict.
//
//   node scripts/verify-agent.mjs            # check everything, write results
//   node scripts/verify-agent.mjs --dry      # report only
//   node scripts/verify-agent.mjs --id gpt55 # one model

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.DATA_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const PRICES = join(ROOT, "data", "prices.json");
const CHANGELOG = join(ROOT, "data", "changelog.json");
const QUEUE = join(ROOT, "data", "verify-queue.json");
const today = new Date().toISOString().slice(0, 10);

const DRY = process.argv.includes("--dry");
const ONLY = process.argv.includes("--id") ? process.argv[process.argv.indexOf("--id") + 1] : null;

// Where each model's price is published, and the name it goes by on that page.
// `aliases` matter: pages rarely use our display name.
export const SOURCES = {
  gpt56sol:  { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.6-sol", "gpt-5.6 sol"] },
  gpt56ter:  { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.6-terra", "gpt-5.6 terra"] },
  gpt56lun:  { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.6-luna", "gpt-5.6 luna"] },
  gpt55:     { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.5"] },
  gpt54:     { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-5.4"] },
  g41mini:   { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-4.1-mini", "gpt-4.1 mini"] },
  g41nano:   { url: "https://platform.openai.com/docs/pricing",         aliases: ["gpt-4.1-nano", "gpt-4.1 nano"] },
  opus5:     { url: "https://www.anthropic.com/pricing",                aliases: ["claude opus 5", "opus 5"] },
  opus48:    { url: "https://www.anthropic.com/pricing",                aliases: ["claude opus 4.8", "opus 4.8"] },
  fable5:    { url: "https://www.anthropic.com/pricing",                aliases: ["claude fable 5", "fable 5"] },
  son5:      { url: "https://www.anthropic.com/pricing",                aliases: ["claude sonnet 5", "sonnet 5"] },
  son46:     { url: "https://www.anthropic.com/pricing",                aliases: ["claude sonnet 4.6", "sonnet 4.6"] },
  haiku45:   { url: "https://www.anthropic.com/pricing",                aliases: ["claude haiku 4.5", "haiku 4.5"] },
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

async function main() {
  const prices = JSON.parse(readFileSync(PRICES, "utf8"));
  const changelog = JSON.parse(readFileSync(CHANGELOG, "utf8"));
  const queue = existsSync(QUEUE) ? JSON.parse(readFileSync(QUEUE, "utf8")) : [];

  const pages = new Map();
  const results = [];

  for (const model of prices.models) {
    if (ONLY && model.id !== ONLY) continue;
    const src = SOURCES[model.id];
    if (!src) { results.push({ id: model.id, status: "flagged", why: "no source URL configured" }); continue; }

    if (!pages.has(src.url)) pages.set(src.url, await fetchPage(src.url));
    const page = pages.get(src.url);
    const r = page.err
      ? { status: "flagged", why: `could not fetch source (${page.err})` }
      : assess(model, page.text, src.aliases);

    results.push({ id: model.id, url: src.url, ...r });

    if (DRY) continue;

    if (r.status === "agent-verified") {
      // Confirming an agreement. A human stamp always outranks this and is left alone.
      if (model.verification !== "verified") {
        model.verification = "agent-verified";
        model.source = src.url;
      }
      model.agent_checked_at = today;
      model.agent_status = "confirmed";
    } else {
      model.agent_checked_at = today;
      model.agent_status = "needs-human";
      model.agent_note = r.why;
      queue.push({ date: today, model: model.id, published: `$${model.inP}/$${model.outP}`,
                   url: src.url, why: r.why, resolved: false });
      changelog.push({ date: today, model: model.id, kind: "flagged_for_review",
                       source: "verify-agent", note: r.why });
    }
  }

  if (!DRY) {
    // keep the queue readable: newest first, drop resolved items older than 30 days
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const kept = queue.filter((q) => !q.resolved || q.date >= cutoff).slice(-200);
    prices.agent_swept_at = today;
    writeFileSync(PRICES, JSON.stringify(prices, null, 2) + "\n");
    writeFileSync(CHANGELOG, JSON.stringify(changelog, null, 2) + "\n");
    writeFileSync(QUEUE, JSON.stringify(kept, null, 2) + "\n");
  }

  const ok = results.filter((r) => r.status === "agent-verified");
  const flagged = results.filter((r) => r.status !== "agent-verified");
  console.log(`\nverify-agent ${today}${DRY ? " (dry run)" : ""}`);
  console.log(`  confirmed on the provider's page: ${ok.length}/${results.length}`);
  if (ok.length) console.log(`    ${ok.map((r) => r.id).join(", ")}`);
  if (flagged.length) {
    console.log(`  needs a human: ${flagged.length}`);
    for (const f of flagged) console.log(`    ${f.id.padEnd(9)} ${f.why}`);
  }
  console.log("");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("verify-agent failed:", e.message); process.exit(1); });
