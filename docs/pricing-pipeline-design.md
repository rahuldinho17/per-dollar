# PerDollar — Pricing Data Pipeline Design

The product lives or dies on one sentence a developer must be able to say: "I trust these numbers." Everything below is engineered toward that sentence. The core stance is borrowed from the best current practice in this space: **never publish a guessed price.** A row is either verified against an official source, or it is visibly marked pending. A pending row builds more trust than a silently stale one.

## Principles

Every published number must be traceable to an official provider page, with the source URL and a verification timestamp attached to the number itself, not to the page as a whole. Storage is append-only: prices are never updated in place, only superseded, which gives you the historical price tracker for free. Automation does the watching, humans (initially: you) do the approving, and the approval step shrinks as parsers prove themselves. Finally, the pipeline treats pricing as multi-dimensional from day one — input, output, cached reads, batch, thinking tokens, long-context tiers — because retrofitting dimensions into a two-column schema is the classic failure of these sites.

## Data model

An append-only relational store (Postgres; SQLite is fine for the MVP) with roughly this shape:

```sql
providers (
  id, name, pricing_url, docs_url,
  parser_strategy,          -- 'json_api' | 'html_parser' | 'llm_extract'
  poll_interval_minutes
)

models (
  id, provider_id, slug, display_name, family,
  context_window, max_output, modality_flags,
  status                    -- 'active' | 'deprecated' | 'preview' | 'suspended'
)

price_points (              -- append-only; current price = latest verified row
  id, model_id,
  dimension,                -- 'input' | 'output' | 'cache_read' | 'cache_write'
                            -- | 'batch_input' | 'batch_output' | 'thinking'
                            -- | 'image_input' | 'tool_call' ...
  tier,                     -- 'standard' | 'priority' | 'long_context_gt_200k' ...
  price_per_mtok, currency, region,
  effective_from,
  source_url, source_snapshot_hash,
  verification_status,      -- 'verified' | 'pending' | 'disputed'
  verified_at, verified_by  -- 'auto:two_sources' | 'human:<user>'
)

price_changes (             -- derived; feeds changelog, alerts, charts
  id, model_id, dimension, tier,
  old_price, new_price, pct_change,
  change_kind,              -- 'cut' | 'hike' | 'new_model' | 'promo_start'
                            -- | 'promo_end' | 'deprecation' | 'correction'
  detected_at, published_at, note
)

task_profiles (             -- powers the "$1 buys you" layer
  id, task_id, model_id,
  median_input_tokens, median_output_tokens,
  verbosity_factor, sample_size, prompt_suite_version,
  measured_at
)

source_snapshots (          -- raw evidence locker
  id, provider_id, url, fetched_at,
  content_hash, raw_html_or_json   -- object storage pointer
)
```

The important subtlety is that `price_points` keys on `(model, dimension, tier, region)`, not on model alone. Gemini 3.1 Pro is $2/$12 below 200K context and $4/$18 above it; that is two tiers of the same model, not a footnote. MiniMax M3's launch promo at half price is a `promo_start` change with an expected `promo_end`, not a permanent cut. Modeling these honestly is most of the difficulty and most of the moat.

## Ingestion: three tiers of source quality

**Tier 1 — structured sources.** Some data arrives machine-readable: OpenRouter's models API exposes cross-provider pricing as JSON, and several providers publish pricing in predictable JSON or documented tables. These get thin, provider-specific fetchers that map fields directly into `price_points`. Cheap, reliable, poll hourly.

**Tier 2 — HTML parsing.** Most first-party pricing pages (OpenAI, Anthropic, Google, DeepSeek, Groq, Mistral) are HTML. For each, fetch on a schedule, hash the content, and only run the parser when the hash changes — this makes hourly polling nearly free and gives you an exact `detected_at` for every change. Each provider gets a dedicated parser (CSS selectors or table extraction) plus a contract test: a stored fixture of the page with known expected output, so a page redesign breaks CI loudly instead of publishing garbage quietly.

**Tier 3 — LLM-assisted extraction.** When a Tier 2 parser breaks or a new provider is added, an LLM extraction pass over the raw snapshot produces candidate `price_points` — but these are *always* created as `pending` and never auto-published. This is the pragmatic middle ground: the LLM handles arbitrary page layouts, the verification gate handles its hallucinations. (Pleasingly, the extraction job itself costs fractions of a cent on a budget model — your own site can tell you which one.)

Every fetch, regardless of tier, writes a `source_snapshot`. When a user questions a number, you can show the exact page bytes it came from and when. That evidence locker is a trust feature and a debugging tool in one.

## Verification gate

A candidate price auto-verifies when two independent sources agree — for example, the provider's own pricing page and OpenRouter's listing for the same first-party endpoint, or two consecutive parses of the official page across a hash change. Anything else lands in a review queue: single-source numbers, disagreements between sources, and anomalies. The anomaly rules are simple and effective: flag any change over ±40%, any brand-new dimension for an existing model, any price of exactly zero, and any currency or unit that differs from the provider's norm. The review UI needs to be nothing more than a table of pending rows next to a rendered snapshot of the source page with one Approve and one Reject button; in the MVP this is fifteen minutes of your morning, and the goal is that Tier 1 and proven Tier 2 parsers gradually bypass it entirely.

Publicly, `pending` rows render as "tracked, awaiting verification" with a link to the official source. This is counterintuitive but correct: admitting what you haven't verified yet is exactly what makes people believe what you have.

## Change detection, changelog, and history

Because storage is append-only and every change produces a `price_changes` event, three user-facing features fall out of one mechanism. The changelog page is a reverse-chronological render of `price_changes` with human-readable notes ("Jul 1: Gemini 3.1 Flash-Lite launched at $0.10/$0.40"). Price history charts per model — the CamelCamelCamel feature — are a straight query over `price_points` ordered by `effective_from`. And alerts (email or RSS: "notify me when any model I follow changes price") are a subscription filter over the same event stream. None of these require new data collection; they require only that you never overwrite a row.

One editorial rule keeps the changelog honest: distinguish `correction` (we had it wrong) from `cut`/`hike` (the provider changed it), and say so plainly. Sites that silently fix their own errors as if the provider moved lose exactly the audience you want.

## The verbosity benchmark pipeline

This is the layer no scraper can copy, because it isn't scraped — it's measured. Maintain a versioned prompt suite: for each task profile (summarize a 10-page PDF, review 500 lines of code, draft an email...), a fixed set of 10–20 realistic prompts with fixed input documents. On a monthly schedule, and within a week of any major model launch, run the full suite against every tracked model through its first-party API and record the `usage` fields the APIs return — actual input and output token counts, plus thinking tokens where billed. From those runs compute the median tokens per job and the verbosity factor per model per task, and store them in `task_profiles` with the suite version and sample size attached.

The cost of this is trivially small — a full monthly run across a dozen models and eight task profiles is single-digit dollars, dominated by the frontier models — and the payoff is the entire "cost per completed job" layer resting on measured data instead of estimates. Publish the methodology and the suite version next to every number. Two things to handle carefully: reasoning models bill hidden thinking tokens that can multiply effective output cost several-fold, so record them as their own dimension rather than folding them into output; and tokenizer changes (Anthropic's post-4.7 tokenizer producing up to ~35% more tokens for the same text is the live example) mean input token counts must also be measured per model, not computed once from the prompt text.

## Edge cases to model deliberately

Long-context price tiers (Gemini's >200K jump) and reasoning surcharges are pricing dimensions, handled above. Beyond those: cache read and cache write prices matter enormously for agent workloads (cache reads at ~10% of input price change the cheapest-model answer at high hit rates, so the task calculator should eventually take a cache-hit-rate slider); batch pricing is a consistent ~50% discount worth a toggle; the same model sold through Azure, Bedrock, Vertex, and OpenRouter carries different prices and belongs in a separate "resold via" comparison rather than mixed into first-party tables; promotions need end dates and a visual promo badge; and regional pricing and currency should be stored per row even if the MVP only publishes USD list prices.

## Serving

Regenerate a static site (plus a public JSON endpoint of current verified prices) on every publish event, rather than querying a database per page view. Static output is fast, cacheable, and screenshot-stable, and the JSON endpoint quietly seeds an API/MCP audience of people who want your data inside their own tools — a distribution channel your competitors are already chasing. Every number on the site carries its freshness inline: "verified 3 days ago · source" as a small annotation, not a footer disclaimer.

## Build order

Phase 1, roughly two weeks of focused work: schema and append-only store; Tier 2 parsers for the six providers that cover 90% of interest (OpenAI, Anthropic, Google, DeepSeek, plus two of Mistral/Groq/xAI); hash-based change detection on an hourly cron; the pending/verified gate with a minimal review UI; changelog page and the current-prices table feeding the PerDollar front end.

Phase 2: price history charts, email/RSS alerts, the OpenRouter Tier 1 feed as the second verification source, and the first verbosity benchmark run with methodology page.

Phase 3: cache-hit and batch toggles in the calculator, resold-via provider comparison, per-task measured cost-per-job replacing estimated profiles, and the public JSON/MCP data feed.

The sequencing logic: trust infrastructure first, because a changelog with six months of accurate history is unfakeable and compounds; measurement second, because it differentiates; distribution features last, because they amplify whatever credibility exists by then.
