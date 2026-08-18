# Spot-priced inference — what The Grid is, and what it means (W34-03)

## What it is

**The Grid** (thegrid.ai) runs a real-time auction for inference. Suppliers bid to serve each
request; you pay the live clearing price per token, with no subscription, limit or lock-in. It
claims up to 80% off list and treats LLM output as *"a fungible commodity"*, sold in graded
instruments — Text Prime, Text Standard, Text Max — rather than by model name. Sellers with idle
GPU capacity list it to monetise round the clock.

It is currently a **paid sponsor across Price Per Token**, appearing on the homepage, the cheapest-
models page and every model page, with the line: *"Why pay list price when providers will bid for
your API usage?"*

## Why it matters

It is a different answer to the question PerDollar answers, and a coherent one. If output is
genuinely fungible, published list prices become a fiction and the right move is an auction, not a
comparison table. That is a real intellectual challenge to a verified-price product, and it is
being advertised to precisely the audience that reads pricing comparisons.

Two things weaken it as a threat, though:

**Fungibility is the whole bet, and it is contestable.** Graded instruments assume Text Standard
from supplier A substitutes for Text Standard from supplier B. That holds for throughput; it does
not obviously hold for capability, latency variance, or — decisively for your buyers — *jurisdiction*.
An auction that treats output as fungible cannot honour "this must be processed in Germany" without
abandoning the thing that makes it an auction.

**Spot pricing and provenance solve opposite problems.** A clearing price is true for one moment
and unauditable afterwards. A finance team asking "what will this cost next quarter" or a compliance
team asking "where was this processed" cannot use a number that changed at 14:03. Spot is for
buyers optimising marginal cost; verified list pricing is for buyers who must budget and evidence.

## What I would say if a prospect raises it

> Spot markets are a good answer when output is fungible and you only care about marginal cost.
> Ours is a good answer when you have to budget, justify or comply. If you can buy on a live
> clearing price and you do not care which supplier serves you, use the auction — genuinely. If
> you need to know which vendor processed the data, what it will cost next month, or why a model
> was chosen, an auction cannot tell you and we can.

## Change I would make

None to the product. One to the language: avoid claiming PerDollar shows "the cheapest" option,
since a spot market can beat any list price. The accurate claim is **the cheapest price you can
verify, budget against and defend** — which is a different and more defensible promise.

Worth revisiting if The Grid adds residency guarantees, which would make it a genuine competitor
rather than an adjacent one.
