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
