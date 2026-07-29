// Re-verification pass (FL-02).
//
// The cron keeps prices CURRENT; only a human makes them VERIFIED. This script
// runs that pass in two modes:
//
//   node scripts/verify.mjs            → print a checklist, oldest verification first
//   node scripts/verify.mjs --stamp id1,id2,...   → mark those models verified today
//   node scripts/verify.mjs --stamp all           → mark every model verified today
//
// Why it exists: unchanged prices keep their last human-check date, so badges
// drift to "VERIFIED 22 JUL" even while data is current. Twenty minutes with this
// checklist turns that into "everything verified this week" — the single cheapest
// way to strengthen the trust story before a customer call.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.DATA_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const PRICES = join(ROOT, "data", "prices.json");
const CHANGELOG = join(ROOT, "data", "changelog.json");
const today = new Date().toISOString().slice(0, 10);
const days = (a, b) => Math.round(Math.abs(new Date(a) - new Date(b)) / 864e5);

const SOURCES = {
  OpenAI: "https://openai.com/api/pricing/",
  Anthropic: "https://www.anthropic.com/pricing",
  Google: "https://ai.google.dev/pricing",
  DeepSeek: "https://api-docs.deepseek.com/quick_start/pricing",
  MiniMax: "https://www.minimax.io/price",
  "Z.AI": "https://z.ai/pricing",
  xAI: "https://x.ai/api",
  "Moonshot AI": "https://platform.moonshot.ai/docs/pricing",
  "Thinking Machines": "https://thinkingmachines.ai/inkling/",
};
// id -> provider, mirrors the ledger
const PROV = {
  opus5:"Anthropic", gpt56sol:"OpenAI", fable5:"Anthropic", gpt55:"OpenAI", opus48:"Anthropic",
  gpt56ter:"OpenAI", gpt54:"OpenAI", son5:"Anthropic", son46:"Anthropic", kimik3:"Moonshot AI",
  gem31p:"Google", grok45:"xAI", inkling:"Thinking Machines", gpt56lun:"OpenAI", gem36f:"Google",
  glm52:"Z.AI", haiku45:"Anthropic", mm3:"MiniMax", gem3f:"Google", g41mini:"OpenAI",
  dsv4f:"DeepSeek", g41nano:"OpenAI", gem31fl:"Google",
};

const prices = JSON.parse(readFileSync(PRICES, "utf8"));
const arg = process.argv.find((a) => a.startsWith("--stamp"));
const stampList = arg ? (process.argv[process.argv.indexOf(arg) + 1] || "").split(",").filter(Boolean) : null;

if (!stampList) {
  // ---- checklist mode ----
  const rows = prices.models
    .map((m) => ({
      ...m,
      prov: PROV[m.id] || "?",
      age: m.verified_at ? days(today, m.verified_at) : Infinity,
    }))
    .sort((a, b) => (a.prov === b.prov ? b.age - a.age : a.prov.localeCompare(b.prov)));

  console.log(`\nRE-VERIFICATION CHECKLIST — ${today}`);
  console.log(`${prices.models.length} models. Confirm each price against the provider's own page.\n`);

  let group = null;
  for (const m of rows) {
    if (m.prov !== group) {
      group = m.prov;
      console.log(`\n  ${group.toUpperCase()}  ${SOURCES[group] || ""}`);
    }
    const age = m.age === Infinity ? "NEVER VERIFIED" : `${m.age}d ago`;
    const flag = m.verification !== "verified" ? "  ⚠ TRACKED — unconfirmed" : "";
    console.log(`    [ ] ${m.id.padEnd(9)} $${String(m.inP).padEnd(6)}in $${String(m.outP).padEnd(6)}out   ${age}${flag}`);
  }

  const stale = rows.filter((m) => m.age > 7).length;
  const unverified = rows.filter((m) => m.verification !== "verified").length;
  console.log(`\n  ${stale} model(s) verified over a week ago; ${unverified} never first-party confirmed.`);
  console.log(`  When done:  node scripts/verify.mjs --stamp all`);
  console.log(`  Or partial: node scripts/verify.mjs --stamp gpt55,opus48\n`);
} else {
  // ---- stamp mode ----
  const all = stampList[0] === "all";
  const changelog = JSON.parse(readFileSync(CHANGELOG, "utf8"));
  let n = 0;
  for (const m of prices.models) {
    if (!all && !stampList.includes(m.id)) continue;
    const was = m.verification;
    m.verification = "verified";
    m.verified_at = today;
    m.source = "first-party pricing page";
    if (was !== "verified") {
      changelog.push({ date: today, model: m.id, kind: "verified",
        source: "human re-verification", note: `promoted from ${was} to verified` });
    }
    n++;
  }
  prices.verified_sweep = today;
  writeFileSync(PRICES, JSON.stringify(prices, null, 2) + "\n");
  writeFileSync(CHANGELOG, JSON.stringify(changelog, null, 2) + "\n");
  console.log(`stamped ${n} model(s) verified ${today}`);
  console.log(`regenerate the public feed with: node scripts/refresh-prices.mjs`);
}
