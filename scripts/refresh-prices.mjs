// Daily price refresh — Tier 1 ingestion (structured source: OpenRouter models API).
// Principles (see docs/pricing-pipeline-design.md):
//  - never guess: a model whose slug isn't found is left untouched
//  - append-only history: every change is appended to data/changelog.json
//  - honest provenance: auto-updated prices are marked "auto-tracked", not "verified"
//  - a promo is a price with a lifespan: fetched prices below standard are parked
//    in promo fields, not recorded as permanent cuts; a return to standard is a
//    promo_end, not a hike. If a provider makes a promo price permanent, a human
//    re-verification promotes it to the standard price.
//
// Run locally:  node scripts/refresh-prices.mjs
// Run by CI:    .github/workflows/refresh-prices.yml (daily cron)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.DATA_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const PRICES_PATH = join(ROOT, "data", "prices.json");
const CHANGELOG_PATH = join(ROOT, "data", "changelog.json");
const MAP_PATH = join(ROOT, "scripts", "openrouter-map.json");
const API = "https://openrouter.ai/api/v1/models";
const EPSILON = 1e-6;      // ignore float noise
const PROMO_BAND = 0.95;   // fetched < 95% of standard => treat as promo/effective discount
const MAX_JUMP = 5;        // anomaly gate: standard-price changes >5x held for human review

const today = new Date().toISOString().slice(0, 10);

function perMillion(perTokenStr) {
  const v = Number(perTokenStr);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 1e6 * 10000) / 10000;
}

async function main() {
  const prices = JSON.parse(readFileSync(PRICES_PATH, "utf8"));
  const changelog = JSON.parse(readFileSync(CHANGELOG_PATH, "utf8"));
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));

  const res = await fetch(API, { headers: {
    Accept: "application/json",
    "User-Agent": "PerDollar-price-refresh/1.1 (+https://github.com/rahuldinho17/per-dollar)",
    ...(process.env.OPENROUTER_API_KEY
      ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } : {}),
  }});
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (!Array.isArray(body?.data)) throw new Error("Unexpected API shape: no data[]");

  const bySlug = new Map(body.data.map((m) => [m.id, m]));
  let changes = 0, missing = [], anomalies = [];
  const log = (entry) => { changelog.push({ date: today, source: "openrouter-api", ...entry }); changes++; };

  for (const model of prices.models) {
    const slug = map[model.id];
    const remote = slug && bySlug.get(slug);
    if (!remote) { missing.push(model.id); continue; }

    for (const [dim, key, promoKey] of [["inP", "prompt", "promoIn"], ["outP", "completion", "promoOut"]]) {
      const next = perMillion(remote.pricing?.[key]);
      if (next == null) continue;
      const std = model[dim];

      if (Math.abs(next - std) <= EPSILON) {
        // back at standard: if a promo was tracked, it has ended
        if (model[promoKey] != null) {
          log({ model: model.id, dimension: dim, old: model[promoKey], new: std, kind: "promo_end" });
          model[promoKey] = null;
          if (model.promoIn == null && model.promoOut == null) model.promoEnds = null;
        }
        continue;
      }

      if (next < std * PROMO_BAND) {
        // below standard: a promo/effective discount, never a silent permanent cut
        if (model[promoKey] !== next) {
          log({ model: model.id, dimension: dim, old: model[promoKey] ?? std, new: next, kind: "promo_price" });
          model[promoKey] = next;
          model.promo_tracked_at = today;
        }
        continue;
      }

      // at-or-above the promo band and different: a genuine standard-price change
      const ratio = std > 0 ? next / std : Infinity;
      if (ratio > MAX_JUMP || ratio < 1 / MAX_JUMP) {
        anomalies.push({ id: model.id, dim, prev: std, next });
        continue;
      }
      log({ model: model.id, dimension: dim, old: std, new: next,
            kind: next < std ? "cut" : "hike" });
      model[dim] = next;
      model[promoKey] = null; // standard moved; any tracked promo is stale
      model.verification = "auto-tracked";
      model.tracked_at = today;
    }
  }

  prices.as_of = today;
  prices.as_of_display = new Date(today).toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" }).toUpperCase();

  writeFileSync(PRICES_PATH, JSON.stringify(prices, null, 2) + "\n");
  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + "\n");

  console.log(`refresh ${today}: ${changes} change(s) applied`);
  console.log(`matched ${prices.models.length - missing.length}/${prices.models.length} models against OpenRouter`);
  if (missing.length) console.log(`not found on OpenRouter (left untouched): ${missing.join(", ")}`);
  if (anomalies.length) {
    console.log("ANOMALIES held for human review (not applied):");
    for (const a of anomalies) console.log(`  ${a.id}.${a.dim}: ${a.prev} -> ${a.next}`);
  }
}

main().catch((e) => { console.error("refresh failed:", e.message); process.exit(1); });
