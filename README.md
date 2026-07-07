# PerDollar

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
