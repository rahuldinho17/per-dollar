---
name: feedback-loop
description: >
  PerDollar's product learning flywheel. Use when the user wants to log a customer
  call / field note, run the monthly product review, review whether shipped changes
  worked, or asks "what should we build next" / "what are we learning". It ingests
  three streams — market news (via the market-radar skill), customer/field notes, and
  product signals — turns them into ranked, buildable proposals weighted by past
  decisions, and (the part market-radar lacks) reviews previously shipped changes
  against outcomes so the system learns which kinds of bets actually paid off.
  Governance is fixed: the loop proposes, the human decides, shipped work is graded.
---

# Feedback Loop — PerDollar's product flywheel

## The thesis (why this skill exists)

Two things are true about PerDollar's market: models and prices commoditize weekly,
and the moat is therefore not the data but *how fast and how trustworthily the product
learns*. Borrowed straight from the a16z "systems compound, models don't" argument and
its governance rule — **high-stakes agents propose, humans decide** — this skill turns
scattered inputs (market news, sales calls, usage) into a compounding loop:

```
   ┌─────────── INGEST ───────────┐
   market news · field notes · usage signals
                  │
             SYNTHESISE  → ranked, buildable proposals (weighted by decision history)
                  │
              DECIDE      → accept / reject / defer  (human, with a reason)
                  │
               SHIP       → accepted items → backlog → built
                  │
              REVIEW      → grade shipped changes against outcome, months later
                  │
                  └────────── the grades re-weight the next SYNTHESISE ──────────┘
```

market-radar covers the market-news arm and the accept/reject memory. This skill wraps
around it to add the two arms that make it a real flywheel rather than a suggestion box:
**field notes from customers**, and **outcome review of what shipped**. Field signal from
real buyers is the highest-value input a product can have; grading outcomes is what stops
the loop from just repeating whatever felt good last month.

## The three input streams

### Stream A — Market (already covered by market-radar)
Run or read the latest `market-radar` brief. Its accepted/rejected themes and its
`decision-log.json` are shared context; this skill reads them, doesn't duplicate them.

### Stream B — Field notes (the highest-signal stream, currently missing)
Every customer call, prospect reply, or advisor conversation is a learning. Capture it
the moment it happens with a one-line log, so nothing is lost between calls. When the
user says something like "log a call with X" or "field note:", append a record to
`field-notes.json`:

```json
{ "date": "2026-07-29", "who": "Ryan @ Aries (agency AI lead)", "type": "call",
  "signal": "wants per-client cost read as a scoping step; objected that support
             volume is hard to estimate without their data",
  "theme": "vertical-depth | gtm | objection | pricing | feature-request",
  "raw_quote": "optional short verbatim, <15 words" }
```

Field notes are not acted on immediately. They accumulate, and the monthly review reads
them in aggregate — three prospects independently asking for the same thing is a far
stronger build signal than one loud request. Tag each with a theme so patterns surface.

### Stream C — Product signals
Read local product state and any available usage data: `data/changelog.json` (how much
the market moved), `data/discovered.json` (models awaiting coverage), the decision logs,
and — if the user has connected analytics — page views, task selections, feed hits. Where
usage data isn't available, say so; don't invent numbers.

## The monthly review (the main workflow)

Run when the user asks for the monthly product review, or on the first field note after
~4 weeks since the last review.

### Step 1 — Ingest all three streams
Read the latest market-radar brief (Stream A), all field notes since the last review
(Stream B), and product state (Stream C). If a market-radar brief is stale (>10 days),
offer to run it first.

### Step 2 — Cluster field notes into signals
Group field notes by theme and count them. A signal repeated by ≥2 independent sources
is promoted to a "pattern" and gets priority. Report single-source notes too, but flag
them as anecdote, not pattern. Quote at most one short verbatim per source.

### Step 3 — Review what shipped (the flywheel's missing gear)
Read `shipped-log.json` — every change previously marked built, with the hypothesis it
was meant to serve. For each shipped item older than ~3 weeks, grade it:
- **outcome**: did the thing it was supposed to move actually move? (won a call, got a
  feed user, changed a metric — or unknown if not yet measurable)
- **grade**: `worked` / `no-effect` / `too-early` / `backfired`
- **lesson**: one line on what this teaches about *which kind of bet* pays off.

Grades feed back into weighting: themes whose shipped items graded `worked` get weighted
UP in synthesis; themes that repeatedly graded `no-effect` get demoted and must justify
themselves. This is the reinforcement — not "did the founder like the idea" but "did the
shipped idea work". If outcomes aren't measurable yet, say `too-early` and re-review next
month; never fabricate an outcome.

### Step 4 — Synthesise ranked proposals
Produce 3–6 buildable changes. Each carries: stable id (`FL-2026-M07-01`), theme, the
change in one sentence, which stream(s) triggered it (with counts for field patterns),
effort (S/M/L), the hypothesis it tests and the metric that would prove it worked, and a
weighting note showing how decision history and shipped-outcome grades moved its rank.
Rank by (evidence-strength × outcome-weight × payoff ÷ effort). Field patterns from
multiple customers outrank clever ideas with no field support.

### Step 5 — Present for decision
Show the review (format below), then each proposal for accept / reject / defer + reason.
The human decides. Nothing auto-builds.

### Step 6 — Record and close
Append verdicts to `decision-log.json` (shared with market-radar). Accepted items go to
`backlog.md` with their hypothesis and success metric. When the user later confirms
something was built, move it to `shipped-log.json` with the date and hypothesis so it
enters the outcome-review cycle. Confirm what was logged in one line.

## Output format

```
# PerDollar Product Review — {month}

## 1. The one thing
{the single clearest signal across all streams, and the decision it forces}

## 2. What we heard  (field notes)
### Patterns (≥2 sources)
- **{theme}** ({n} sources): {synthesised signal}. e.g. {who} — "{short quote}"
### Anecdotes (1 source, watch)
- {one-liners}

## 3. What the market did  (from market-radar)
- {the 1–2 developments that matter for the build queue, sourced}

## 4. What we shipped, and whether it worked
| id | shipped | hypothesis | grade | lesson |
{honest grades — worked / no-effect / too-early / backfired}

## 5. What to build next  (ranked)
| id | theme | change | triggered by | effort | hypothesis → metric | weight note |

## 6. Decisions needed
{each proposal, phrased for one-message accept/reject/defer with reason}

## 7. Loop health
{what the memory now says: winning themes, dead themes, standing constraints,
open bets awaiting outcome. So the flywheel is visible, not hidden.}
```

## Files

- `field-notes.json` — append-only customer/prospect/advisor signal. The highest-value stream.
- `shipped-log.json` — what got built, its hypothesis, and its eventual outcome grade.
- `decision-log.json` — shared with market-radar; the accept/reject memory.
- `backlog.md` — accepted, not-yet-built, with hypothesis + success metric.
- `reviews/{month}.md` — each monthly review, for trend-spotting.

## Governance (fixed, non-negotiable)

- **The loop proposes; the human decides.** No change ships without an explicit accept.
- **Grade honestly.** A review that finds every shipped change "worked" is broken. If a
  bet had no effect or backfired, say so — that lesson is worth more than a win.
- **Field beats cleverness.** A change wanted by three real customers outranks an elegant
  idea with no field support, every time.
- **Never fabricate a signal or an outcome.** No usage data → say so. Not measurable yet
  → `too-early`. Anecdote → labelled anecdote, not pattern.
- **One short quote per source max**; paraphrase the rest. Respect the person's words.

## Cadence

Field notes: logged continuously, whenever a call happens (seconds of effort).
Monthly review: the deep pass. A reminder issue is opened on the 1st of each month by
`.github/workflows/product-review.yml`, the same pattern as the weekly market-radar
reminder — so the loop turns without a calendar to maintain.

## Where field notes live (the capture habit)

The canonical log is a Google Sheet in the user's Drive:
**PerDollar — Field Notes (feedback loop input)**
`https://docs.google.com/spreadsheets/d/1nKts3GhbwVgoMab45ZAnAVEdl2ZYpJsIGq00zJjfL1s/edit`

One row per conversation, filled in within ~10 minutes of the call. Columns: Date, Who,
Role/Company, Type, Theme, Signal, Verbatim, Next action, Status.

Two capture routes, both fine:
1. The user types a row directly into the Sheet after a call.
2. The user tells Claude *"field note: <who> — <what they said>"*; Claude appends to
   `skills/feedback-loop/field-notes.json` and, when Drive is connected, mirrors the row
   into the Sheet.

At review time, read BOTH the Sheet (via Drive) and `field-notes.json`, and reconcile —
the Sheet is the human-facing source of truth, the JSON is what the loop computes on.

## The impact view (ROI)

`impact.html` is the founder-facing view of what the loop actually changed. It is built
from `data/loop.json`, regenerated by `node scripts/build-loop-view.mjs` after any review
or ship. Headline metric is **loop velocity** — median days from signal heard to change
shipped — because that is the number that compounds. Every shipped change is traced to the
signal that caused it; ungraded items show as `too-early` rather than being counted as wins,
and the page states plainly that no euro ROI exists until a first audit is paid.

**Always run `node scripts/build-loop-view.mjs` after logging decisions or shipping work**,
or the impact view will silently show stale numbers — the same failure mode the product
itself is built to avoid.
