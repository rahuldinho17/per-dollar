// Builds data/loop.json — the single served dataset behind impact.html.
// Consolidates the feedback-loop skill's files into one traceable event stream:
//   field note (signal) → decision → shipped change → outcome grade
// and computes the loop-health metrics. Run after any review:
//   node scripts/build-loop-view.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.DATA_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const FL = join(ROOT, "skills", "feedback-loop");
const MR = join(ROOT, "skills", "market-radar");
const read = (p, f) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f);

const notes = read(join(FL, "field-notes.json"), []);
const shipped = read(join(FL, "shipped-log.json"), []);
const flDecisions = read(join(FL, "decision-log.json"), []);
const mrDecisions = read(join(MR, "decision-log.json"), []);
const decisions = [...mrDecisions, ...flDecisions];
const changelog = read(join(ROOT, "data", "changelog.json"), []);
const prices = read(join(ROOT, "data", "prices.json"), { models: [] });

const today = new Date().toISOString().slice(0, 10);
const day = 864e5;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / day);
const isoWeek = (d) => {
  const t = new Date(d);
  const th = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  th.setUTCDate(th.getUTCDate() + 4 - (th.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(th.getUTCFullYear(), 0, 1));
  return `${th.getUTCFullYear()}-W${String(Math.ceil(((th - y0) / day + 1) / 7)).padStart(2, "0")}`;
};

// --- trace each shipped item back to the signal that caused it -------------
// A change is only "loop-driven" if we can name the input that triggered it.
// Everything else is counted separately as founder-initiated, honestly.
const TRACE = {
  "MR-2026-W30-01": { source: "market", trigger: "Ramp launch + control-point framing", heard: "2026-07-27" },
  "MR-2026-W30-02": { source: "market", trigger: "Ramp free router + paid dashboard", heard: "2026-07-27" },
  "MR-2026-W30-03": { source: "field",  trigger: "Kai (ShopAgentic): price data is the hard part", heard: "2026-07-22" },
  "MR-2026-W30-04": { source: "field",  trigger: "commerce buyers need named workloads", heard: "2026-07-26" },
  "MR-2026-W30-05": { source: "market", trigger: "CloudZero owns 'visibility'", heard: "2026-07-27" },
  "FL-2026-M07-05": { source: "field",  trigger: "Daniel Royo: guarantee is an enterprise red flag", heard: "2026-07-29" },
  "FL-2026-M07-01": { source: "market", trigger: "cost-performance is now the ranking metric", heard: "2026-07-29" },
  "FL-2026-M07-02": { source: "field",  trigger: "verified dates read stale to prospects", heard: "2026-07-29" },
  "FL-2026-M07-03": { source: "market", trigger: "a16z: field telemetry is the flywheel input", heard: "2026-07-29" },
};

const events = shipped.map((s) => {
  const t = TRACE[s.id] || {};
  const lead = t.heard ? daysBetween(t.heard, s.shipped) : null;
  return {
    id: s.id, week: isoWeek(s.shipped), shipped: s.shipped,
    theme: s.theme, change: s.change, hypothesis: s.hypothesis,
    metric: s.success_metric, grade: s.grade || "too-early",
    outcome: s.outcome || "", lesson: s.lesson || "",
    source: t.source || "founder", trigger: t.trigger || "internal decision",
    heard: t.heard || null, lead_days: lead,
  };
}).sort((a, b) => b.shipped.localeCompare(a.shipped));

// --- metrics ---------------------------------------------------------------
const leads = events.map((e) => e.lead_days).filter((n) => n != null).sort((a, b) => a - b);
const median = leads.length ? leads[Math.floor(leads.length / 2)] : null;
const graded = events.filter((e) => e.grade !== "too-early");
const worked = graded.filter((e) => e.grade === "worked");

const weeks = [...new Set(events.map((e) => e.week))].sort().reverse();
const byWeek = weeks.map((w) => {
  const ship = events.filter((e) => e.week === w);
  return {
    week: w,
    shipped: ship,
    notes: notes.filter((n) => n.date && isoWeek(n.date) === w).length,
    decisions: decisions.filter((d) => d.date && isoWeek(d.date) === w).length,
  };
});

const themeCounts = {};
for (const e of events) themeCounts[e.theme] = (themeCounts[e.theme] || 0) + 1;

const loop = {
  built: today,
  metrics: {
    notes_logged: notes.length,
    patterns: (() => {
      const c = {};
      for (const n of notes) c[n.theme] = (c[n.theme] || 0) + 1;
      return Object.values(c).filter((v) => v >= 2).length;
    })(),
    decisions_made: decisions.length,
    accepted: decisions.filter((d) => d.decision === "accept").length,
    rejected: decisions.filter((d) => d.decision === "reject").length,
    deferred: decisions.filter((d) => d.decision === "defer").length,
    changes_shipped: events.length,
    loop_driven: events.filter((e) => e.source !== "founder").length,
    from_field: events.filter((e) => e.source === "field").length,
    from_market: events.filter((e) => e.source === "market").length,
    median_lead_days: median,
    fastest_lead_days: leads.length ? leads[0] : null,
    graded: graded.length,
    worked: worked.length,
    awaiting_grade: events.length - graded.length,
    hit_rate: graded.length ? Math.round((worked.length / graded.length) * 100) : null,
  },
  product: {
    models_tracked: prices.models.length,
    verified: prices.models.filter((m) => m.verification === "verified").length,
    price_events: changelog.length,
  },
  themes: themeCounts,
  weeks: byWeek,
  events,
  open_notes: notes.filter((n) => (n.status || "") !== "actioned").length,
};

writeFileSync(join(ROOT, "data", "loop.json"), JSON.stringify(loop, null, 2) + "\n");
console.log(`loop.json built: ${events.length} shipped changes, ${notes.length} notes, ` +
  `median lead ${median ?? "n/a"}d, ${loop.metrics.awaiting_grade} awaiting grade`);
