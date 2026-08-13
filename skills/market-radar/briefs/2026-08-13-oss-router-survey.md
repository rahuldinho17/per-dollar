# Open-source LLM routers on GitHub — what's out there, and what it means for PerDollar
*Kai's T2.3, 13 Aug 2026*

## The landscape, sorted by what they actually do

The word "router" covers three different products, and conflating them is how founders in this space waste six months.

### 1. Gateways — plumbing, not decisions

**LiteLLM** (~18k stars, MIT, Python) is the default. One OpenAI-compatible interface in front of 100+ providers, virtual keys, multi-tenant spend tracking, per-project budgets, rate limiting, caching, an admin dashboard. The crucial line from the reviews: *it doesn't include intelligent task classification — you still choose which model to call. Routing logic must be built on top.*

**Portkey Gateway** is the commercial sibling: conditional routing, fallbacks, retries, circuit breakers, semantic caching, budget limits. Same gap, stated the same way — teams that want scored model comparisons driving routing policy still need a separate evaluation workflow.

*Read: these are the rails. Neither decides anything on quality grounds. Both are complements to PerDollar, not competitors.*

### 2. Research classifiers — decisions, but on the wrong axis

**RouteLLM** (LMSYS, ~4k stars, Apache 2.0) trains classifiers on 80,000+ Chatbot Arena human-preference comparisons; published results show ~2× cost reduction with minimal quality loss on MT-Bench. Matrix factorisation, BERT and causal-LM router architectures.

**LLMRouter** (ulab-uiuc, ~1k stars) is the academic toolkit — SimRouter, MLPRouter, GraphRouter, a RouteProfile framework, even a ComfyUI drag-and-drop interface for training routers.

*Read: excellent research, wrong training signal for your buyer. "Which answer would a human prefer in a chat arena" is not "did the bug get fixed at my company." Their data is public and generic; the ledger's is private and specific.*

### 3. Production routers — the real competitors

**ClawRouter** (BlockRunAI, MIT) is the aggressive one: analyses each request across 15 dimensions, routes to the cheapest capable model **in under 1ms, entirely locally**, claims up to 88% cost reduction, 66 models with 8 free, no signup, and — genuinely novel — wallet-based auth with USDC payments on Base/Solana so *agents can pay for themselves without a human's credit card*.

**vLLM Semantic Router** (vllm-project, backed by AMD) is the serious one, and the closest thing to a threat. A "signal-driven decision routing framework" composing policies across **cost, privacy, latency and safety**, with 16 signal families, PII and jailbreak classifiers inline, an Envoy sidecar deployment, replay of every routing decision with usage and cost, and an IETF draft protocol (SIRP). Shipping fast: v0.1 in January, v0.3 "Themis" in June, new architecture posts monthly.

## The uncomfortable finding

**vLLM Semantic Router already routes on privacy, and explicitly on data boundaries.** Its own words: *"Inference spans edge, private, and cloud. Keep data within its boundaries."* And: *"Sensitive data and proprietary information automatically route to internal models for privacy and compliance, while general queries leverage external APIs."*

That is adjacent to your residency feature, and I would rather you hear it from me than from Kai.

But look at what it actually does, because the difference is the whole point. Its privacy routing classifies the **prompt** — is there PII in this request? — and if so sends it to a *local or internal* model. It is a content classifier feeding an infrastructure decision, and it assumes you already run internal models.

PerDollar's residency filter classifies the **provider** — where does this vendor process data, and does that satisfy the customer's jurisdiction? It answers "which commercial endpoint may I legally use", and it carries the dataset of EU hosters that makes the answer actionable.

Those are complementary, not competing. A team could plausibly use vLLM SR to detect that a request is sensitive and PerDollar to know which EU-resident vendor can take it. But the overlap is real enough that "nobody does residency" is now too strong a claim, and you should stop making it.

## Six takeaways

**1. Stop saying "no one routes on residency." Say what's actually true.** The defensible claim is narrower and better: *nobody carries verified pricing for EU-resident hosting, so nobody can tell you the cheapest compliant option.* vLLM SR can route away from a US API; it cannot tell you IONOS is €0.10/M and Scaleway €0.18/M, because that data doesn't exist anywhere but your `eu-hosts.json`.

**2. Your moat is the dataset, not the algorithm.** Every project here has better routing machinery than you — 15 dimensions, 16 signal families, trained classifiers, sub-millisecond local inference. None has verified prices with provenance, EU-host coverage, or a counterfactual ledger. Compete where you're ahead.

**3. Position as a data layer for these projects, not against them.** vLLM SR and LiteLLM both need pricing data to make cost decisions, and both currently have none worth the name. `/api/decide` and `/feed/prices.json` could be what their cost signals consume. That's a distribution channel disguised as a competitor — and it's the shape Kai hinted at when he said the price data was the valuable part.

**4. Do not build a proxy.** LiteLLM has 18k stars and Portkey has funding; ClawRouter does local routing in 1ms. Your MCP-and-HTTP design, sitting outside the request path, is the right call — and now it's the *validated* right call.

**5. Steal one idea: decision replay.** vLLM SR records every routing decision with its signals, usage and cost, for debugging misroutes. Your ledger records cost and counterfactual but not *why* the model was chosen. Storing the reason turns "we saved $X" into "here is every decision and its justification" — which is what an auditor or a sceptical CTO will actually ask for. Small change, big credibility.

**6. Note where the money isn't.** These are almost all MIT/Apache with no revenue model; Martian, the best-funded pure router, left the category entirely. That reinforces the earlier conclusion — routing is not the business. Verified data, compliance answers, and provable savings are.

## What I'd do with this

Tell Kai you did the survey he suggested, and tell him what it changed: the residency claim gets narrowed to something defensible, and the strategy shifts from "our router competes" to "our data feeds routers." He recommended it twice, so reporting back with a changed conclusion is the strongest possible signal that his input lands.

Then two small builds: **store the decision reason in the ledger** (takeaway 5), and **write one page on how to use PerDollar's feed with LiteLLM or vLLM SR** (takeaway 3). Both are days, not weeks, and both convert this research into position.
