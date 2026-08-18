# PerDollar + vLLM Semantic Router

vLLM Semantic Router composes routing policies across cost, privacy, latency and safety. Its
privacy signal classifies the *prompt* — is there PII here — and keeps sensitive requests on
internal models. PerDollar classifies the *provider*: which commercial endpoint satisfies a
jurisdiction, and what it costs. The two compose cleanly.

## Feed the cost signal

The cost dimension needs prices that are current and attributable. Pull them from the feed:

```yaml
# fetched on a schedule into your policy config
cost_source:
  url: https://per-dollar.vercel.app/feed/prices.json
  fields:
    input:  input_per_mtok
    output: output_per_mtok
  trust:              # ignore anything unconfirmed
    verification: [verified, agent-verified]
```

Each entry also carries `capability` (Artificial Analysis Intelligence Index, null when the
model has no published score — never estimated) and `verbosity`, an answer-length multiplier.
Without verbosity, cost-per-token comparisons understate wordier models.

## Add jurisdiction as a policy dimension

Every model carries `residency`: `us`, `global`, `non-eu`, or `self`, with a note explaining
the caveat. Combine it with your PII signal:

- PII detected **and** EU subject → require `residency` in `{eu-de, eu-fr, self}`
- No PII → optimise on cost across the whole pool

`data/eu-hosts.json` in the repo carries EU-resident open-weight hosting — IONOS, Scaleway,
OVHcloud, STACKIT, Aleph Alpha, Mistral, Nebius EU, Gcore — which appears in no pricing
aggregator. That is the set your policy needs when the answer must stay in Europe.

## Or ask for the decision directly

```bash
curl "https://per-dollar.vercel.app/api/decide?task=code-fix&residency=eu-de"
```

Returns the model, the reasoning, the runner-up, and everything excluded with its reason —
which slots into decision-replay debugging rather than replacing it.
