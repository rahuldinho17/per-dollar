---
name: market-radar
description: >
  Run PerDollar's weekly market review. Use when the user asks to run the market
  radar, do the weekly review, "what happened this week", check on competitors, or
  when they paste an article/newsletter and ask what it means for PerDollar. Produces
  a dated brief with (1) what happened, (2) what it means for the product, (3) ranked
  suggested changes, and (4) an explicit decision log the user accepts or rejects.
  The user's accept/reject choices are remembered week to week so the system learns
  which kinds of suggestions land — this is the reinforcement loop, not a metaphor.
---

# Market Radar — PerDollar's weekly learning loop

## What this is for

PerDollar competes in a market that moves weekly: models launch, prices fall, and
well-funded incumbents (Ramp, Vantage, CloudZero, OpenRouter, BenchmarkList) ship
adjacent features. This skill turns that flow into product decisions instead of
anxiety. It runs a structured weekly review, proposes concrete changes, and — the
part that makes it a *learning* loop — records which suggestions the founder accepts
or rejects, so each week's proposals are shaped by the pattern of past decisions.

It is explicitly a decision-support tool, not an autopilot. It never changes the
product on its own. It surfaces, ranks, and remembers; the human decides.

## The reinforcement loop, concretely

"Reinforcement learning" here is a real, inspectable mechanism, not a buzzword:

1. Each week the skill proposes changes, each tagged with a **theme** (e.g.
   `pricing-transparency`, `new-model-coverage`, `competitor-parity`, `vertical-depth`,
   `data-feed`, `gtm-copy`, `defensibility`).
2. The founder accepts, rejects, or defers each one — with a one-line reason.
3. Those verdicts are appended to `skills/market-radar/decision-log.json`.
4. Before proposing the next week's changes, the skill reads the log and adjusts:
   themes the founder has repeatedly accepted are weighted up and proposed first;
   themes repeatedly rejected are demoted and must clear a higher bar (the skill must
   state *why this instance is different* from the ones already rejected).
5. Rejected reasons are treated as constraints. If "too far from commerce" killed a
   suggestion once, future suggestions are pre-checked against that constraint and
   the check is shown.

The point: by week 6 the brief should feel tuned to this founder's actual strategy,
proposing fewer off-target ideas and defending the borderline ones explicitly.

## Running the weekly review

### Step 1 — Gather (do the retrieval, don't ask permission)

Search the web for the last 7 days across these beats. Run multiple distinct
searches; scale to ~10–15 queries. Prefer primary sources over aggregators.

- **Model launches & pricing** — new models, price cuts, promos, deprecations from
  OpenAI, Anthropic, Google, DeepSeek, MiniMax, Moonshot, xAI, Z.AI, Mistral, Qwen,
  and OSS hosts (Together, Fireworks, Groq, DeepInfra).
- **Direct & adjacent competitors** — Ramp, Vantage, CloudZero, OpenRouter,
  BenchmarkList, Helicone, Langfuse, BenchLM, llm-stats, Vellum, plus any new
  entrant doing LLM cost/observability.
- **The buyer's world (commerce)** — AI adoption in e-commerce support, catalogue,
  search; commercetools / Shopify / Storyblok ecosystem AI moves; FinOps-for-AI.
- **Category narrative** — funding, M&A, and analyst framing in AI cost management
  and agentic-commerce (the ShopAgentic adjacency).

If the user pasted an article, treat it as one high-priority source and still run a
few searches around it to corroborate and find the second-order angle.

Also read local product state so suggestions are grounded in what exists:
`data/prices.json`, `data/changelog.json`, `data/discovered.json`, and the three
pages (`index.html`, `app.html`, `hosts.html`).

### Step 2 — Read the memory

Read `skills/market-radar/decision-log.json` (create it as `[]` if absent). Compute,
per theme: accepts, rejects, and the standing constraints from rejection reasons.
Carry forward any item previously marked `defer` — it must reappear this week.

### Step 3 — Analyse

For each meaningful development, write three things and nothing more:
- **What happened** — one factual sentence, sourced. Paraphrase; never paste article
  text. Prices and claims get a citation.
- **Why it matters to PerDollar** — the specific product/GTM/defensibility implication.
  If it doesn't matter, cut it. A short brief that's all signal beats a long one.
- **Confidence** — high/medium/low, and what would raise it.

Separate genuine signal from noise. A competitor shipping your exact feature is
high signal. A generic "AI is big" funding stat is not, unless it changes the
category narrative the way the Ramp/control-point framing does.

### Step 4 — Propose changes (ranked, memory-weighted)

Produce 3–6 concrete, buildable suggestions. Each carries:
- a stable `id` (e.g. `MR-2026-W30-01`),
- a `theme` tag,
- the change in one sentence, specific enough to implement,
- the trigger (which development prompted it),
- effort (S/M/L) and the expected payoff,
- **memory check**: if the theme has past rejects, state why this one clears the bar;
  if it matches a standing constraint, show the pre-check.

Rank by (payoff × memory-weight ÷ effort). Never propose more than 6; a focused list
gets acted on, a long one gets ignored.

### Step 5 — Present for decision

Show the brief (see format below), then present each suggestion so the user can
**accept / reject / defer** with a one-line reason. Make it easy to answer in one
message ("accept 1 and 4, reject 2 because too far from commerce, defer the rest").

### Step 6 — Record

Append every verdict to `decision-log.json` with date, id, theme, decision, reason.
Accepted items also get written to `skills/market-radar/backlog.md` as a ready-to-build
queue. Confirm what was logged in one line. Do not start building unless the user
says so — accepting a suggestion queues it; it doesn't trigger implementation.

## Output format

```
# PerDollar Market Radar — Week of {date}

## 1. This week in one line
{the single most important thing, and the one action it implies}

## 2. What happened
### Signal
- **{headline}** — {what happened, sourced}. *Why it matters:* {implication}. ({confidence})
### Noise (logged, not acted on)
- {one-liners, so the founder sees they were considered and dismissed}

## 3. Suggested changes  (ranked)
| id | theme | change | trigger | effort | payoff | memory note |

## 4. Decisions needed
{each suggestion, phrased for a one-message accept/reject/defer with reason}

## 5. Memory snapshot
{what the log currently says: most-accepted themes, standing constraints,
carried-over defers — so the loop is visible, not hidden}
```

## Files

- `decision-log.json` — append-only verdict history; the learning substrate.
- `backlog.md` — accepted suggestions, ready to build.
- `briefs/{date}.md` — each week's brief, kept for trend-spotting.

## Guardrails

- Retrieval first: never write the brief from memory of the market; the whole value
  is freshness. Search, then write.
- Sourcing and copyright: paraphrase, cite prices/claims, one short quote max per
  source, never reproduce article structure.
- Honesty over cheerleading: if the week's news is bad for PerDollar (a competitor
  shipped the moat), say so plainly and orient the response toward the defensible
  move. A radar that only finds good news is broken.
- The founder decides. This skill proposes and remembers; it does not act.
- Keep it tight. A weekly brief that takes 15 minutes to read won't be read.

## Weekly cadence (automated reminder)

A GitHub Action (`.github/workflows/market-radar.yml`) runs every Monday 07:00 UTC
and opens a GitHub issue titled "Run Market Radar — week of <date>". GitHub emails
that issue to the repo owner, so Monday never slips without any calendar to maintain.
The review itself needs web search and judgement, so it runs in a Claude session:
open Claude, say "run the market radar", work through the accept/reject/defer, and
close the issue. The reminder is automatic; the thinking stays human by design.
