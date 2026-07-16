// Daily price refresh — Tier 1 ingestion (structured source: OpenRouter models API).
// Principles (see docs/pricing-pipeline-design.md):
//  - never guess: a model whose slug isn't found is left untouched
//  - append-only history: every change is appended to data/changelog.json
//  - honest provenance: auto-updated prices are marked "auto-tracked", not "verified"
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
const EPSILON = 1e-6; // ignore float noise
const MAX_JUMP = 5;   // anomaly gate: refuse changes >5x or <1/5x without human review

const today = new Date().toISOString().slice(0, 10);

function perMillion(perTokenStr) {
  const v = Number(perTokenStr);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 1e6 * 10000) / 10000; // 4 dp of $/Mtok
}

async function main() {
  const prices = JSON.parse(readFileSync(PRICES_PATH, "utf8"));
  const changelog = JSON.parse(readFileSync(CHANGELOG_PATH, "utf8"));
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));

  const res = await fetch(API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.data)) throw new Error("Unexpected API shape: no data[]");

  const bySlug = new Map(body.data.map((m) => [m.id, m]));
  let changes = 0, missing = [], anomalies = [];

  for (const model of prices.models) {
    const slug = map[model.id];
    const remote = slug && bySlug.get(slug);
    if (!remote) { missing.push(model.id); continue; }

    for (const [dim, key] of [["inP", "prompt"], ["outP", "completion"]]) {
      const next = perMillion(remote.pricing?.[key]);
      if (next == null) continue;
      const prev = model[dim];
      if (Math.abs(next - prev) <= EPSILON) continue;

      const ratio = prev > 0 ? next / prev : Infinity;
      if (ratio > MAX_JUMP || ratio < 1 / MAX_JUMP) {
        anomalies.push({ id: model.id, dim, prev, next });
        continue; // anomaly: log, do not auto-apply
      }

      changelog.push({
        date: today, model: model.id, dimension: dim,
        old: prev, new: next,
        kind: next < prev ? "cut" : "hike",
        source: "openrouter-api",
      });
      model[dim] = next;
      model.verification = "auto-tracked";
      model.tracked_at = today;
      changes++;
    }
  }

  prices.as_of = today;
  prices.as_of_display = new Date(today).toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" }).toUpperCase();

  writeFileSync(PRICES_PATH, JSON.stringify(prices, null, 2) + "\n");
  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + "\n");

  console.log(`refresh ${today}: ${changes} change(s) applied`);
  if (missing.length) console.log(`not found on OpenRouter (left untouched): ${missing.join(", ")}`);
  if (anomalies.length) {
    console.log(`ANOMALIES held for human review (not applied):`);
    for (const a of anomalies) console.log(`  ${a.id}.${a.dim}: ${a.prev} -> ${a.next}`);
  }
}

main().catch((e) => { console.error("refresh failed:", e.message); process.exit(1); });
