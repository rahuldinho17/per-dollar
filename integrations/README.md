# Using PerDollar with the router you already have

PerDollar does not want to be your gateway. LiteLLM, Portkey and vLLM Semantic Router
already move traffic well; what none of them carries is verified pricing, EU-resident
host coverage, or a record of why a model was chosen. Point them at the feed and keep
your existing plumbing.

Two things are free and need no account:

- **`/feed/prices.json`** — 26 models, refreshed daily, each labelled with who verified
  the price and when. Includes `capability`, `verbosity`, `residency` and legacy flags.
- **`/api/decide`** — give it a task and your constraints, get back a model and the
  reasoning.

See `litellm.md` and `vllm-semantic-router.md`.
