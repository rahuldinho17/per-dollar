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
