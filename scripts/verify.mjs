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
// The date must come from the clock, never from a human typing one. A verification
// stamp that says a check happened on a day it did not is worse than a stale stamp.
const today = new Date().toISOString().slice(0, 10);
if (process.argv.includes("--date")) {
  console.error("refusing --date: verification stamps are read from the system clock, never supplied.");
  process.exit(1);
}
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

// ---- promo review mode ----------------------------------------------------
// A promo is a price with a lifespan, so it needs confirming differently from a
// standard price: is it real, and when does it end? Uniform discounts are the
// tell that we have picked up a pricing TIER (batch is ~50%, cached ~10%) and
// mislabelled it as a promotion.
if (process.argv.includes("--promos")) {
  const rows = prices.models.filter((m) => m.promoIn != null || m.promoOut != null);
  if (!rows.length) { console.log("\nNo promos currently tracked.\n"); process.exit(0); }

  console.log(`\nPROMO REVIEW — ${today}`);
  console.log(`${rows.length} model(s) carry a promotional price. Confirm each against the`);
  console.log(`provider's own page: is it a real, time-limited offer — and when does it end?\n`);

  for (const m of rows) {
    const prov = PROV[m.id] || "?";
    const inPct = m.promoIn != null ? (m.promoIn / m.inP) * 100 : null;
    const outPct = m.promoOut != null ? (m.promoOut / m.outP) * 100 : null;
    const near = (v, t) => v != null && Math.abs(v - t) < 3;
    let suspicion = "";
    if (near(inPct, 50) && near(outPct, 50)) suspicion = "  ⚠ exactly 50% — this is the batch-API discount signature, not a promo";
    else if (near(inPct, 10) && near(outPct, 10)) suspicion = "  ⚠ ~10% — looks like a cached-input rate, not a promo";
    else if (inPct != null && outPct != null && Math.abs(inPct - outPct) > 20)
      suspicion = "  ⚠ input and output discounted unevenly — check you are comparing the same SKU";

    console.log(`  [ ] ${m.id.padEnd(9)} ${prov}`);
    console.log(`        standard  $${m.inP} in / $${m.outP} out`);
    console.log(`        promo     $${m.promoIn ?? "—"} in / $${m.promoOut ?? "—"} out` +
                `   (${inPct != null ? inPct.toFixed(0) : "—"}% / ${outPct != null ? outPct.toFixed(0) : "—"}%)`);
    console.log(`        ends      ${m.promoEnds || "UNANNOUNCED"}`);
    console.log(`        source    ${SOURCES[prov] || "?"}`);
    if (suspicion) console.log(suspicion);
    console.log("");
  }
  console.log(`  Confirm a real promo and set its end date:`);
  console.log(`    node scripts/verify.mjs --promo-confirm mm3 --ends 2026-09-30`);
  console.log(`  Not a promo (it was a batch/cached tier, or it has ended):`);
  console.log(`    node scripts/verify.mjs --promo-clear gpt56ter,gpt56lun\n`);
  process.exit(0);
}

if (process.argv.includes("--promo-confirm") || process.argv.includes("--promo-clear")) {
  const changelog = JSON.parse(readFileSync(CHANGELOG, "utf8"));
  const flagAt = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  const confirm = flagAt("--promo-confirm");
  const clear = flagAt("--promo-clear");
  const ends = flagAt("--ends");
  let n = 0;

  for (const m of prices.models) {
    if (confirm && confirm.split(",").includes(m.id)) {
      m.promoEnds = ends || null;
      m.promo_verified_at = today;
      changelog.push({ date: today, model: m.id, kind: "promo_confirmed", source: "human re-verification",
        note: `promo confirmed first-party${ends ? `, ends ${ends}` : ", end date unannounced"}` });
      n++;
    }
    if (clear && clear.split(",").includes(m.id)) {
      changelog.push({ date: today, model: m.id, kind: "correction", source: "human re-verification",
        note: `promo removed — ${m.promoIn}/${m.promoOut} was not a promotional rate (likely a batch or cached tier)` });
      m.promoIn = null; m.promoOut = null; m.promoEnds = null;
      n++;
    }
  }
  writeFileSync(PRICES, JSON.stringify(prices, null, 2) + "\n");
  writeFileSync(CHANGELOG, JSON.stringify(changelog, null, 2) + "\n");
  console.log(`updated ${n} model(s). Regenerate the feed: node scripts/refresh-prices.mjs`);
  process.exit(0);
}

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
