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
const MAX_JUMP = 5;        // anomaly gate on standard-price changes
const DISCOVERY_TTL_DAYS = 60; // drop stale unreviewed discoveries

// Only surface discoveries from labs we actually cover. OpenRouter lists
// hundreds of models; an unfiltered queue would be noise, not signal.
const TRACKED_VENDORS = [
  "openai", "anthropic", "google", "deepseek", "minimax", "z-ai",
  "x-ai", "moonshotai", "mistralai", "qwen", "meta-llama", "cohere",
];

const today = new Date().toISOString().slice(0, 10);
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
      if (ratio > MAX_JUMP || ratio < 1 / MAX_JUMP) { anomalies.push({ id: model.id, dim, prev: std, next }); continue; }

      log({ model: model.id, dimension: dim, old: std, new: next, kind: next < std ? "cut" : "hike" });
      model[dim] = next;
      model[promoKey] = null;
      model.verification = "auto-tracked";
      model.tracked_at = today;
    }
  }

  // ---- 2. discovery: tracked-vendor models we don't yet carry --------------
  const knownSlugs = new Set(Object.values(map));
  const seenNow = new Set();
  let newFinds = 0;

  for (const remote of body.data) {
    const slug = remote.id || "";
    const vendor = slug.split("/")[0];
    if (!TRACKED_VENDORS.includes(vendor)) continue;
    if (knownSlugs.has(slug)) continue;
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
  discovered.sort((a, b) => (b.first_seen || "").localeCompare(a.first_seen || ""));

  // ---- 3. write ------------------------------------------------------------
  prices.as_of = today;
  prices.as_of_display = new Date(today).toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" }).toUpperCase();

  writeFileSync(PRICES_PATH, JSON.stringify(prices, null, 2) + "\n");
  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + "\n");
  writeFileSync(DISCOVERED_PATH, JSON.stringify(discovered, null, 2) + "\n");

  // ---- 4. report -----------------------------------------------------------
  console.log(`refresh ${today}: ${changes} change(s) applied`);
  console.log(`matched ${prices.models.length - missing.length}/${prices.models.length} tracked models`);
  if (missing.length) console.log(`not found on OpenRouter (left untouched): ${missing.join(", ")}`);
  console.log(`discovery: ${newFinds} new listing(s), ${discovered.length} awaiting review${dropped ? `, ${dropped} stale dropped` : ""}`);
  if (newFinds) {
    console.log("NEW LISTINGS — add to scripts/openrouter-map.json + data/prices.json to publish:");
    for (const d of discovered.filter((x) => x.first_seen === today)) {
      console.log(`  ${d.slug}  $${d.inP} in / $${d.outP} out`);
    }
  }
  if (anomalies.length) {
    console.log("ANOMALIES held for human review (not applied):");
    for (const a of anomalies) console.log(`  ${a.id}.${a.dim}: ${a.prev} -> ${a.next}`);
  }
}

main().catch((e) => { console.error("refresh failed:", e.message); process.exit(1); });
