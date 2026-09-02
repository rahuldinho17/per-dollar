<!-- mcp-name: io.github.rahuldinho17/perdollar -->

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

## Feedback Loop skill (skills/feedback-loop/)

The product learning flywheel that wraps around market-radar. Three input streams:
market news (from market-radar), field notes (log every customer call the moment it
happens — "field note: <who> — <what they said>"), and product signals. A monthly
review clusters field notes into patterns, grades what shipped last month against real
outcomes (worked / no-effect / too-early / backfired), and proposes ranked next builds
weighted by both your past decisions AND whether prior bets actually worked. Governance
is fixed: the loop proposes, you decide, shipped work gets graded honestly. A monthly
GitHub-issue reminder (product-review.yml) keeps it turning. First review:
skills/feedback-loop/reviews/2026-07.md. Seeded with the real field notes and shipped
items from the project so far.

## Impact view & re-verification

- `impact.html` — what the feedback loop changed, week by week, with loop velocity
  (median days signal→ship), hit rate, and every change traced to its trigger. Built from
  `data/loop.json` via `node scripts/build-loop-view.mjs`.
- `scripts/verify.mjs` — the re-verification pass. `node scripts/verify.mjs` prints a
  provider-grouped checklist (one pricing page per visit); `node scripts/verify.mjs --stamp all`
  marks them verified today. Run weekly, and before customer calls: the cron keeps prices
  current, but only a human makes them *verified*.
- Capability data: the ledger now carries Artificial Analysis Intelligence Index (v4.1)
  scores where published, a VALUE column (capability per euro of job cost), and a minimum
  capability filter answering "cheapest model that clears the bar". Models with no published
  score show "no score" and are excluded when a floor is set — never given an invented number.

### Date discipline

`verified_at` must always be the date a human actually checked the price. Use
`node scripts/verify.mjs --stamp ...`, which reads the system date — never write a
date by hand into `data/prices.json`. A mis-stamped verification date is worse than
a stale one: it asserts a check that did not happen on that day.

This has now gone wrong twice, both times because a date was typed rather than read
(29 Jul stamped for a 3 Aug sweep; 1 Sep stamped for a 25 Aug sweep). `verify.mjs`
refuses a `--date` flag for that reason. If you find yourself about to type a date
into a data file, stop and run the script instead.

### Reviewing promos

`node scripts/verify.mjs --promos` lists every model carrying a promotional price with
its discount ratio, and flags the patterns that mean we have mislabelled a pricing
*tier* as a promotion — an exact 50/50 discount is the batch-API signature, ~10% is a
cached-input rate, and an uneven input/output split usually means two different SKUs.
Then either `--promo-confirm <ids> --ends YYYY-MM-DD` or `--promo-clear <ids>`; both
write to the changelog, clears as corrections.

## Daily verification agent

`scripts/verify-agent.mjs` runs after each price refresh. For every model it fetches the
provider's own pricing page and looks for the price we publish.

- **Found** → the row becomes `agent-verified` with the date. A human `verified` stamp
  always outranks this and is never overwritten; the badge just notes the agent
  re-confirmed it.
- **Not found, or different** → the row is flagged with `?`, an explanation is written to
  `data/verify-queue.json`, and the changelog records it. **The agent never edits a price.**

Two rules make it trustworthy. It can only confirm, never change — a disagreement is a
question for a human, not a silent update. And silence is not consent: an unparseable page
is *flagged*, never verified, because an agent that marks things verified when it finds
nothing to contradict would destroy the only thing this product sells.

```
node scripts/verify-agent.mjs --dry        # report without writing
node scripts/verify-agent.mjs --id gpt55   # one model
cat data/verify-queue.json                 # what needs a human
```

Expect flags on JavaScript-rendered pricing pages (several providers render prices
client-side, so a plain fetch sees nothing). Those need either a headless browser or a
provider-specific extractor; until then they stay honestly flagged rather than assumed.

## Endpoint layout (and a Vercel gotcha)

Anything inside `api/` is treated by Vercel as a serverless function, so a **static**
JSON file placed there stops being served. That is what broke `/api/prices.json`.

The static feed therefore lives at **`/feed/prices.json`** and the functions read it
from there. `vercel.json` rewrites `/api/prices.json` and `/api/prices` to it so older
links keep working, and `functions.includeFiles` bundles `feed/`, `data/` and `router/`
so the handlers can read them at runtime.

| URL | What it is |
|---|---|
| `/feed/prices.json` | static price feed, updated daily |
| `/api/decide?task=…` | which model to use, with residency |
| `/api/budget?task=…&budget=…&volume=…` | best model that fits a budget |
| `/api/route?task=…` | lower-level routing with all options |
| `/try.html` | the same thing as a web form, no terminal needed |

## Using PerDollar with an existing router

See `integrations/` — drop-in recipes for LiteLLM and vLLM Semantic Router. PerDollar stays
out of the request path; you keep your gateway and gain verified prices, EU-host coverage and
a reason attached to every decision.

## Distribution

- `server.json` + `packages/mcp/` — the MCP server packaged for the official registry
  (`registry.modelcontextprotocol.io`). Build with `bash packages/mcp/build.sh`, publish to npm,
  then `mcp-publisher publish`. The README carries the required `mcp-name` marker.
- `integrations/` — recipes for using the feed with LiteLLM and vLLM Semantic Router. PerDollar
  stays out of the request path; they keep their gateway and gain verified prices, EU-host
  coverage and a reason attached to every decision.
- `skills/radar-to-post/` — turns each weekly market-radar brief into a LinkedIn post. Run it
  straight after the radar. It drafts; you post.

### A failure mode worth remembering

The feed lived at `api/prices.json` until Vercel started treating everything in `api/` as a
serverless function. It moved to `feed/prices.json`, every reader was repointed — and the
workflow's commit step still said `git add data/ api/`. So for a week the cron ran green every
morning, regenerated the public feed, and threw it away. The site served a stale feed while the
Actions tab showed nothing but success.

The lesson is not "check the paths". It is that a green pipeline proves the steps ran, not that
they did anything. When a job's whole purpose is to change a file, assert the file changed.
