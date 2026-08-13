# PerDollar router — decision layer + savings ledger

Model *prices* are a commodity; anyone can scrape them. The gap is **decisioning**:
existing routers move traffic where you tell them, and vendor routers lean toward
their own cheap inference. This picks the cheapest model that is still capable
enough for a given task, from the models your team can actually reach, and says
why — then proves what it saved.

Two pieces:

**B1 · the decision** — `perdollar_route` / `GET /api/route` / `cli route`.
Takes a task class, optional real token counts, the models you have access to, a
capability floor and a cache-hit rate. Returns the pick, the reason, the runner-up,
and everything it excluded with the reason.

**B2 · the counterfactual ledger** — `perdollar_report` / `cli report`.
After each task, record which model ran it and which model the developer would have
reached for anyway. Both costs are then known, so the saving needs no A/B test and
no eval harness. `savings` aggregates it.

## Why the agent, not the human

Distributed model choice is unpoliceable: engineers reach for the biggest model
because they can, and a governance policy is a nag. If the agent consults the
router itself, the right choice is the default and nobody has to be persuaded.

## Install for Claude Code

```bash
claude mcp add perdollar -- node /absolute/path/to/router/mcp-server.mjs
```

Then tell the agent: *before starting a task, call `perdollar_route`; after
finishing, call `perdollar_report` with the real token counts.*

## CLI

```bash
node router/cli.mjs route agent-step --available opus5,haiku45,gem3f --cache 0.8
node router/cli.mjs report --task code-fix --used gem3f --default opus5 --in 9000 --out 1100
node router/cli.mjs savings
```

## HTTP

```bash
curl "https://per-dollar.vercel.app/api/route?task=code-fix"
curl "https://per-dollar.vercel.app/api/route"        # lists task classes and options
```

## Where data lives

The ledger is a local JSON file (`~/.perdollar/ledger.json`, override with
`PERDOLLAR_HOME`). Token counts and task names never leave the machine — a pilot
lands far more easily that way, and aggregates can be shared later by choice.

## Honest limits

- **Capability floors are heuristics, not eval results.** They encode a judgement
  about what a task class needs. Validate on your own traffic before trusting them.
- **14 of 24 tracked models have no published capability score.** They are excluded
  when a floor is set, which can push you onto a dearer model — pass
  `allow_unscored` to include them, and the response says when it did.
- **The counterfactual assumes no retry.** If a cheaper model needed two attempts,
  the recorded saving is overstated. Pair the ledger with a quality check.

## Data residency (T1.1)

For an EU buyer, residency is not a preference — it is the binding constraint, and
cost optimisation happens strictly inside it. No other router models this.

```bash
node router/cli.mjs route product-copy --residency eu-de   # must stay in Germany
curl ".../api/route?task=code-fix&residency=eu"            # anywhere in the EU
```

Levels: `eu-de` (Germany only) · `eu` (EU) · `eu-ok` (EU preferred, global endpoints
acceptable) · `any`. Applied before cost, so a German-residency query never returns a
US-operated API however cheap it is.

`data/eu-hosts.json` carries EU-resident open-weight hosting — IONOS, Scaleway,
OVHcloud, STACKIT — plus a self-hosting break-even note. These providers publish no
pricing API and appear in no aggregator, which is why they are worth carrying: for a
compliance-constrained buyer they are the entire shortlist. Every row is `tracked`
and must be confirmed against the provider's page before being quoted.

## Budget adherence (T1.3)

Every other router minimises cost. That is not how a buyer thinks: they allocate a
budget — "$500 per developer per month" — and then, in Kai's words, *"they hope"*.
So this inverts the optimisation. Spend the allocation well: return the **most
capable** model whose projected month still fits.

```bash
node router/cli.mjs budget agent-step --budget 500 --volume 1200
node router/cli.mjs burn --budget 500        # month-to-date pace
curl ".../api/budget?task=agent-step&budget=500&volume=1200"
```

It tightens on its own. Money already spent is money the rest of the month cannot
spend, so the per-job ceiling falls as the month burns and the pick downgrades
without anyone intervening:

```
spent $0  day 0   ceiling $0.0375    GPT-5.6 Terra          cap 55
spent $38 day 15  ceiling $0.0117    GPT-5.6 Luna           cap 51
spent $44 day 15  ceiling $0.0017    Gemini 3.1 Flash-Lite  cap —
```

When nothing fits it says so plainly rather than silently picking the cheapest and
overrunning: *"nothing fits this budget. The cheapest option still projects $X, $Y
over. Raise the budget, cut volume, or accept the overrun."*

Cursor and Copilot do this internally to keep users inside a subscription. This is
the same mechanic pointed outward, at a budget the customer sets — and it composes
with residency, so an EU-only team gets the best model that is both compliant and
affordable.
