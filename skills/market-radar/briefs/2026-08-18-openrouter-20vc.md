# Alex Atallah on 20VC — read for PerDollar

Interview published days around the $7B Stripe deal, so read it as a seller's narrative as
well as an operator's. Four items matter.

## The one aimed at us

**"Copycat routers that treat routing as a side feature are playing to exist rather than to win."**
His criteria for real routing: relentless optimisation of latency, cost and shifting model
quality, with maximum developer flexibility.

He is right, and it does not describe PerDollar — because those are *gateway* criteria. PerDollar
is deliberately not in the request path: it adds no latency, carries no traffic, and does not
compete on flexibility because it does not serve requests at all. It answers a question the
gateway does not: which model, from the ones you can reach, given a budget and a jurisdiction,
and what did that decision save.

**The answer if it is thrown at you:** "He's describing gateways, and he's right about them —
that's a scale game and OpenRouter won it. We don't route traffic. We answer which model to use
and prove what it saved, over prices somebody actually verified. The gateway is complementary;
we publish recipes for using our feed inside LiteLLM and vLLM Semantic Router."

Worth remembering he said this while selling. "Nobody can compete with us" is a useful thing to
have said the week you are acquired.

## The gift

**"Employee cost is no longer just a fixed salary. It increasingly includes the variable inference
spend of the AI tools each employee deploys. Companies will need to evaluate workforce performance
through a cost-to-productivity lens."**

That is PerDollar's per-developer workload framing, articulated by the most credible voice in the
category. Adopted on the site: an engineer costs a salary plus whatever their tools burn, and the
second half moves weekly. It is also the framing that reaches a CFO, who thinks in fully-loaded
employee cost and not in tokens.

## The number that reshapes the coverage argument

**One new model every ten hours**, with fragmentation increasing rather than consolidating.

This looked like an argument against a 26-model ledger. It is the opposite, but only if the
curation is explicit: at that rate nobody can verify the market, so sites tracking 300+ models are
republishing aggregator data with no one accountable for a wrong number. Fewer models with stated
provenance is the defensible position — hence the new Coverage section saying plainly what we add,
what we skip, and why.

It also raises the cost of falling behind. We were two releases stale within a week at 26 models;
the discovery-to-GitHub-issue change now closes that loop.

## The gap it exposed

US behind China on open weights, Chinese labs state-backed, and Chinese-origin models already
around 46% of US enterprise tokens on OpenRouter.

We tag **residency** — where the operator processes data. We do not tag **provenance** — who built
the model and under whose jurisdiction the operator sits. For a European bank those are different
questions, and "no Chinese-origin models" is a real procurement constraint we cannot currently
express. Logged as a backlog candidate; it is the natural extension of the residency work and
nobody else has it either.

## Two smaller notes

- **Jevons paradox** — prices fall, usage grows faster, bills rise anyway. This is the argument
  for budget adherence: unit-cost optimisation alone does not protect a budget when volume is
  compounding.
- **"Model labs will come after your startup"** — a thin wrapper on one lab is exposed. A neutral
  cross-vendor comparison is structurally not something a lab will build, which is a reason to
  stay independent rather than pick a side.
