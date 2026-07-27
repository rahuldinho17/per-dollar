# PerDollar

## Pages

- `index.html` — marketing landing page (hero, problem, worked commerce example, the audit offer). This is the homepage.
- `app.html` — the live interactive price sheet / cost explorer (formerly the homepage), linked from the landing page as "Live price sheet". Loads `/data/prices.json`.

**Understand what your AI budget actually buys.**

PerDollar compares LLM APIs by cost per completed job, not cost per token. Pick a budget and a real task — fix a bug, review a PR, resolve a support ticket — and see how many jobs each model delivers, normalized for how verbose each model's answers actually run.

## Why

Token prices are abstractions; jobs are not. 1,000 tokens from different models is not the same amount of answer (different tokenizers, different verbosity), and the cheapest model per token is often not the cheapest per completed task.

## What's here

- `index.html` — self-contained static site (no build step; deploys anywhere, including Vercel drag-and-drop)
- `docs/pricing-pipeline-design.md` — design for the automated pricing ingestion/verification pipeline

## Data notes

- Prices: standard-tier first-party API list rates, verified July 2026
- Task list: usage-weighted, drawn from published studies (Anthropic Economic Index, OpenRouter State of AI, OpenAI usage report)
- Token footprints and verbosity factors: launch estimates, to be replaced by an empirical benchmark suite

## Feedback form

The "Give feedback" button in the header points to a Google Form. Create the form
(spec below), then replace `https://forms.gle/REPLACE_ME` in `index.html` with your
form's share link.

Form settings (blocks anonymous submissions):
- Settings → Responses → "Collect email addresses" → **Verified** (requires Google sign-in)
- Settings → Responses → "Limit to 1 response" → on
- Mark all identity fields as **Required**

Questions:
1. Name — short answer, required
2. Role — short answer, required
3. Company — short answer, required
4. Would you use this when picking a model — or is a plain pricing table enough?
   (multiple choice: I'd use this / Pricing table is enough / Not sure + "Other")
5. What would make you come back monthly?
   (multiple choice: Price-drop alerts / Cost-per-task history / Budget forecasting
   for my workload / None of these + "Other")
6. Would your company pay for any of it?
   (multiple choice: Yes / Maybe, depends on price / No)
7. Anything else? — paragraph, optional

## Daily price refresh

`data/prices.json` is the page's data source (the HTML carries a fallback copy).
A GitHub Actions cron (`.github/workflows/refresh-prices.yml`) runs daily at
05:17 UTC: it pulls current prices from the OpenRouter models API, applies
changes, appends them to `data/changelog.json`, and commits — Vercel redeploys
automatically. Safety rails: models not found on OpenRouter are left untouched;
changes larger than 5x are held as anomalies for human review (visible in the
Action log) rather than published; auto-updated prices display as AUTO-TRACKED
until re-verified against first-party pages. Check the slugs in
`scripts/openrouter-map.json` against openrouter.ai/models after the first run.
Manual run: Actions tab → "Refresh prices (daily)" → Run workflow.

## Promo handling

A promo is a price with a lifespan. The refresh script never records a
below-standard fetched price as a permanent cut: it parks it in promoIn/promoOut
(changelog kind promo_price), and a return to standard is logged as promo_end,
not a hike. The site shows both prices side by side with a PROMO badge; rankings
default to the effective price and the "plan with standard prices" toggle
re-ranks at list price. If a provider makes a promo permanent, promote it by
re-verifying the standard price manually.

## Model discovery

The daily refresh also *discovers*. Any model from a tracked vendor (OpenAI,
Anthropic, Google, DeepSeek, MiniMax, Z.AI, xAI, Moonshot, Mistral, Qwen, Meta,
Cohere) that appears on OpenRouter but isn't in `openrouter-map.json` is written
to `data/discovered.json` with status `pending` and logged in the Action output.
It is never auto-published: the API supplies a price but not a display name, an
answer-length factor, or a human check. The site surfaces the queue as
"N new listings awaiting verification". To publish one, add its slug to
`openrouter-map.json` and an entry to `data/prices.json`, then re-verify against
the provider's own pricing page.

## Same model, every host (`hosts.html`)

Open-weight models have no single price: the same weights served by DeepInfra,
Fireworks, Together, Groq etc. carry different rates, and prompt caching moves
the ranking again. `hosts.html` compares hosts for one model on cost per
finished job, with a cache-hit-rate slider that blends standard and cached input
rates. Hosts publishing no cached rate are charged at standard (conservative),
which is why the spread widens as the slider rises.

Host prices are compiled from published provider comparisons (Jun–Jul 2026) and
marked `tracked`, not `verified` — first-party confirmation is pending and no
number should be quoted to a customer before that check.

### Discovery tuning

Discovery queues only models released in the last 45 days (`DISCOVERY_MAX_AGE_DAYS`),
capped at 40 entries. Without the recency filter every model a tracked lab has ever
published lands in the queue — the first run produced 215 entries, which is noise, not
a review queue. Models with no `created` timestamp are skipped and counted in the log.
If you widen the vendor list, re-check the queue size on the next run.

## Market Radar skill (skills/market-radar/)

A weekly competitive/market review that feeds product decisions. Run it by asking
"run the market radar" or by pasting an article and asking what it means for PerDollar.
It searches the last 7 days across model launches, competitors (Ramp, CloudZero,
Vantage, OpenRouter, BenchmarkList...), the commerce buyer's world, and category
narrative; then produces a brief with what happened, why it matters, and 3–6 ranked,
buildable suggestions. Each suggestion is accepted/rejected/deferred with a reason,
logged to decision-log.json. That log is the reinforcement loop: accepted themes get
weighted up next week, rejected reasons become constraints checked against future
suggestions. Accepting queues an item to backlog.md; it never auto-builds. First brief:
skills/market-radar/briefs/2026-07-27.md.
