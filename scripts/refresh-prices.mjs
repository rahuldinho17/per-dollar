// Daily price refresh — Tier 1 ingestion (structured source: OpenRouter models API).
//
// Principles (see docs/pricing-pipeline-design.md):
//  - never guess: a model whose slug isn't found is left untouched
//  - append-only history: every change is appended to data/changelog.json
//  - honest provenance: auto-updated prices are marked "auto-tracked", not "verified"
//  - a promo is a price with a lifespan: fetched prices below standard are parked
//    in promo fields, not recorded as permanent cuts; a return to standard is a
//    promo_end, not a hike
//  - NEW: discovery. Models from tracked vendors that we don't yet carry are
//    written to data/discovered.json as a review queue and surfaced on the site
//    as "awaiting verification" — never auto-published, because the API gives us
//    prices but not display names, answer-length factors, or a human check.
//
// Run locally:  node scripts/refresh-prices.mjs
// Run by CI:    .github/workflows/refresh-prices.yml (daily cron)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.DATA_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const PRICES_PATH = join(ROOT, "data", "prices.json");
const CHANGELOG_PATH = join(ROOT, "data", "changelog.json");
const DISCOVERED_PATH = join(ROOT, "data", "discovered.json");
const MAP_PATH = join(ROOT, "scripts", "openrouter-map.json");
const API = "https://openrouter.ai/api/v1/models";

const EPSILON = 1e-6;      // ignore float noise
const PROMO_BAND = 0.95;   // fetched < 95% of standard => promo, not a permanent cut
const MAX_CUT   = 5;      // a 5x cut is plausible in this market
const MAX_HIKE  = 1.25;   // a >25% rise is rare enough that a human should look at it
const DISCOVERY_TTL_DAYS = 60;      // drop stale unreviewed discoveries
const DISCOVERY_MAX_AGE_DAYS = 45;  // only queue genuinely NEW listings
const DISCOVERY_CAP = 40;           // a queue nobody can read is not a queue

// Only surface discoveries from labs we actually cover. OpenRouter lists
// hundreds of models; an unfiltered queue would be noise, not signal.
const TRACKED_VENDORS = [
  "openai", "anthropic", "google", "deepseek", "minimax", "z-ai",
  "x-ai", "moonshotai", "mistralai", "qwen", "meta-llama", "cohere",
  "thinkingmachines", "thinking-machines", "nvidia", "microsoft",
];

const today = new Date().toISOString().slice(0, 10);

const DISPLAY = {
  gpt56sol:["GPT-5.6 Sol","OpenAI"], fable5:["Claude Fable 5","Anthropic"],
  gpt55:["GPT-5.5","OpenAI"], opus48:["Claude Opus 4.8","Anthropic"],
  gpt56ter:["GPT-5.6 Terra","OpenAI"], gpt54:["GPT-5.4","OpenAI"],
  son5:["Claude Sonnet 5","Anthropic"], son46:["Claude Sonnet 4.6","Anthropic"],
  kimik3:["Kimi K3","Moonshot AI"], gem31p:["Gemini 3.1 Pro","Google"],
  grok45:["Grok 4.5","xAI"], inkling:["Inkling","Thinking Machines"],
  gpt56lun:["GPT-5.6 Luna","OpenAI"], gem36f:["Gemini 3.6 Flash","Google"],
  glm52:["GLM-5.2","Z.AI"], haiku45:["Claude Haiku 4.5","Anthropic"],
  mm3:["MiniMax M3","MiniMax"], gem3f:["Gemini 3 Flash","Google"],
  g41mini:["GPT-4.1 Mini","OpenAI"], dsv4f:["DeepSeek V4 Flash","DeepSeek"],
  g41nano:["GPT-4.1 Nano","OpenAI"], dsv4pro:["DeepSeek V4 Pro","DeepSeek"], opus5:["Claude Opus 5","Anthropic"], gem31fl:["Gemini 3.1 Flash-Lite","Google"],
};

function writePublicFeed(prices, ROOT) {
  const feed = {
    "$schema": "https://per-dollar.vercel.app/api/schema.json",
    feed: "perdollar-prices", version: "1.0",
    as_of: prices.as_of, currency: "USD", unit: "per_million_tokens",
    license: "Free to use with attribution to PerDollar (per-dollar.vercel.app).",
    disclaimer: "Standard-tier first-party API list prices. 'verified' = checked against the provider's own pricing page; 'tracked' = from a published comparison, pending first-party confirmation. Promotional prices are separate from standard. Not financial advice.",
    models: prices.models.map((m) => {
      const [name, provider] = DISPLAY[m.id] || [m.id, "?"];
      const e = { id: m.id, name, provider,
        input_per_mtok: m.inP, output_per_mtok: m.outP,
        verification: m.verification || "verified",
        verified_at: m.verified_at ?? null, source: m.source ?? null,
        residency: m.residency ?? null, residency_note: m.residency_note ?? null };
      if (m.promoIn != null) e.promo = { input_per_mtok: m.promoIn, output_per_mtok: m.promoOut, ends: m.promoEnds ?? null };
      return e;
    }),
  };
  writeFileSync(join(ROOT, "api", "prices.json"), JSON.stringify(feed, null, 2) + "\n");
}

const daysBetween = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;

function perMillion(perTokenStr) {
  const v = Number(perTokenStr);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 1e6 * 10000) / 10000;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

async function main() {
  const prices = JSON.parse(readFileSync(PRICES_PATH, "utf8"));
  const changelog = JSON.parse(readFileSync(CHANGELOG_PATH, "utf8"));
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  let discovered = readJson(DISCOVERED_PATH, []);

  const res = await fetch(API, { headers: {
    Accept: "application/json",
    "User-Agent": "PerDollar-price-refresh/1.2 (+https://github.com/rahuldinho17/per-dollar)",
    ...(process.env.OPENROUTER_API_KEY
      ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } : {}),
  }});
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (!Array.isArray(body?.data)) throw new Error("Unexpected API shape: no data[]");

  const bySlug = new Map(body.data.map((m) => [m.id, m]));
  let changes = 0;
  const missing = [], anomalies = [];
  const log = (entry) => { changelog.push({ date: today, source: "openrouter-api", ...entry }); changes++; };

  // ---- 1. refresh prices for models we already carry -----------------------
  for (const model of prices.models) {
    const slug = map[model.id];
    const remote = slug && bySlug.get(slug);
    if (!remote) { missing.push(model.id); continue; }

    for (const [dim, key, promoKey] of [["inP", "prompt", "promoIn"], ["outP", "completion", "promoOut"]]) {
      const next = perMillion(remote.pricing?.[key]);
      if (next == null) continue;
      const std = model[dim];

      if (Math.abs(next - std) <= EPSILON) {
        if (model[promoKey] != null) {           // back at standard => promo ended
          log({ model: model.id, dimension: dim, old: model[promoKey], new: std, kind: "promo_end" });
          model[promoKey] = null;
          if (model.promoIn == null && model.promoOut == null) model.promoEnds = null;
        }
        continue;
      }

      if (next < std * PROMO_BAND) {             // below standard => promo, not a cut
        if (model[promoKey] !== next) {
          log({ model: model.id, dimension: dim, old: model[promoKey] ?? std, new: next, kind: "promo_price" });
          model[promoKey] = next;
          model.promo_tracked_at = today;
        }
        continue;
      }

      const ratio = std > 0 ? next / std : Infinity;
      if (ratio > MAX_HIKE || ratio < 1 / MAX_CUT) {
        anomalies.push({ id: model.id, dim, prev: std, next,
          why: ratio > MAX_HIKE ? `+${Math.round((ratio - 1) * 100)}% — check the slug maps to the right SKU` : `${Math.round((1 - ratio) * 100)}% cut — unusually large` });
        continue;
      }

      log({ model: model.id, dimension: dim, old: std, new: next, kind: next < std ? "cut" : "hike" });
      model[dim] = next;
      model[promoKey] = null;
      // A machine changed this number, so the human verification no longer applies to it.
      // Keeping verified_at/source here silently launders a scrape into a human check —
      // the exact provenance corruption this product exists to prevent.
      model.verification = "auto-tracked";
      model.tracked_at = today;
      model.verified_at = null;
      model.source = "openrouter-api";
    }
  }

  // ---- 2. discovery: tracked-vendor models we don't yet carry --------------
  const knownSlugs = new Set(Object.values(map));
  const seenNow = new Set();
  let newFinds = 0;

  let skippedOld = 0, skippedUndated = 0;
  for (const remote of body.data) {
    const slug = remote.id || "";
    const vendor = slug.split("/")[0];
    if (!TRACKED_VENDORS.includes(vendor)) continue;
    if (knownSlugs.has(slug)) continue;

    // Only surface genuinely new listings. Without this, every model a tracked
    // lab has ever published lands in the queue and the queue becomes noise.
    const created = remote.created ? new Date(remote.created * 1000) : null;
    if (!created || isNaN(created)) { skippedUndated++; continue; }
    if (daysBetween(today, created.toISOString().slice(0, 10)) > DISCOVERY_MAX_AGE_DAYS) {
      skippedOld++; continue;
    }
    seenNow.add(slug);

    const existing = discovered.find((d) => d.slug === slug);
    const inP = perMillion(remote.pricing?.prompt);
    const outP = perMillion(remote.pricing?.completion);

    if (existing) {                              // refresh prices on the queued entry
      existing.inP = inP; existing.outP = outP; existing.last_seen = today;
    } else {
      discovered.push({
        slug, vendor,
        name: remote.name || slug,
        inP, outP,
        context_length: remote.context_length ?? null,
        released: created.toISOString().slice(0, 10),
        first_seen: today, last_seen: today,
        status: "pending",                       // never auto-published
      });
      newFinds++;
      changelog.push({ date: today, source: "openrouter-api", model: slug,
        kind: "discovered", note: "new listing from tracked vendor, awaiting verification" });
    }
  }

  // drop stale entries nobody reviewed and that have vanished from the feed
  const before = discovered.length;
  discovered = discovered.filter((d) =>
    seenNow.has(d.slug) || daysBetween(today, d.last_seen) < DISCOVERY_TTL_DAYS);
  const dropped = before - discovered.length;
  discovered.sort((a, b) => (b.released || b.first_seen || "").localeCompare(a.released || a.first_seen || ""));
  if (discovered.length > DISCOVERY_CAP) discovered = discovered.slice(0, DISCOVERY_CAP);

  // ---- 3. write ------------------------------------------------------------
  prices.as_of = today;
  prices.as_of_display = new Date(today).toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" }).toUpperCase();

  writeFileSync(PRICES_PATH, JSON.stringify(prices, null, 2) + "\n");
  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + "\n");
  writeFileSync(DISCOVERED_PATH, JSON.stringify(discovered, null, 2) + "\n");
  writePublicFeed(prices, ROOT);   // MR-03: keep the public feed in sync

  // ---- 4. report -----------------------------------------------------------
  console.log(`refresh ${today}: ${changes} change(s) applied`);
  console.log(`matched ${prices.models.length - missing.length}/${prices.models.length} tracked models`);
  if (missing.length) {
    console.log(`not found on OpenRouter (left untouched): ${missing.join(", ")}`);
    console.log("SLUG SUGGESTIONS — the mapped slug did not match. Candidates from the same vendor:");
    for (const id of missing) {
      const wrong = map[id] || "";
      const vendor = wrong.split("/")[0];
      const stem = (wrong.split("/")[1] || "").split(/[-.]/)[0];   // e.g. "gemini"
      const candidates = body.data
        .map((m) => m.id)
        .filter((slug) => slug.startsWith(vendor + "/") && !knownSlugs.has(slug))
        .filter((slug) => !stem || slug.includes(stem))
        .slice(0, 8);
      // vendor prefix itself may be wrong (thinking-machines vs thinkingmachines)
      const fallback = candidates.length ? [] : body.data
        .map((m) => m.id)
        .filter((slug) => !knownSlugs.has(slug) && stem && slug.split("/")[1]?.includes(stem))
        .slice(0, 5);
      console.log(`  ${id}  (mapped to "${wrong}")`);
      const out = candidates.length ? candidates : fallback;
      if (out.length) out.forEach((c) => console.log(`      → ${c}`));
      else console.log("      → no candidate slugs found");
    }
  }
  console.log(`discovery: ${newFinds} new listing(s) in the last ${DISCOVERY_MAX_AGE_DAYS} days, ` +
    `${discovered.length} awaiting review${dropped ? `, ${dropped} stale dropped` : ""}` +
    ` (skipped ${skippedOld} older, ${skippedUndated} undated)`);
  if (newFinds) {
    console.log("NEW LISTINGS — add to scripts/openrouter-map.json + data/prices.json to publish:");
    for (const d of discovered.filter((x) => x.first_seen === today)) {
      console.log(`  ${d.slug}  $${d.inP} in / $${d.outP} out`);
    }
  }
  if (anomalies.length) {
    console.log("ANOMALIES held for human review (not applied):");
    for (const a of anomalies) console.log(`  ${a.id}.${a.dim}: ${a.prev} -> ${a.next}  (${a.why})`);
  }
}

main().catch((e) => { console.error("refresh failed:", e.message); process.exit(1); });
