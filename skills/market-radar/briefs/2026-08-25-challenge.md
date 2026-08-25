# Radar challenge — week of 25 Aug 2026

*First run. You have already accepted all suggestions; this is the case you accepted them
against, and it changes my recommendation on two of them.*

## Verdicts

| id | radar says | challenger says | why |
|----|-----------|-----------------|-----|
| **W35-01** residency uplift | Verify, then model a 10% uplift | **Endorse with a condition** | Correctness on the core differentiator, so yes — but the evidence is *one secondary source*. Verify against a provider's own page before a single number moves. If it cannot be confirmed first-party, do not model it; an invented uplift is worse than a missing one. |
| **W35-02** Sonnet 5 | Re-check against Anthropic | **Endorse — and it was worse than stated** | Confirmed: $2/$10 made permanent on 10 Aug. Our human verification on 13 Aug recorded $3/$15 *three days after the announcement*. The failure was not staleness, it was a human reading the wrong row. That has implications the radar did not draw. |
| **W35-04** $2-tier demo | Use as standing demo | **Challenge** | It is now obsolete. Sonnet 5 at $2/$10 versus Terra at $2/$12 versus Gemini 3.1 Pro at $2/$12 is a *weaker* demo than the radar thought, because Sonnet is now cheapest on both sides rather than a genuine tie broken by output. Rebuild it or drop it. |
| **W35-05** retire the line, lead with AWpD | Urgent | **Split the verdict.** Retiring "cheapest model that clears your quality bar": **endorse, urgent** — it is a competitor's copy. Leading with AWpD: **reject for now.** | You cannot demonstrate AWpD. Zero tasks routed means zero coverage, and the metric's own output puts coverage first for exactly that reason. Leading with a number you cannot produce, against a rival quoting 40% from real users, invites the one question you cannot answer. |
| **W35-06** Ramp comparison | Replace CloudZero comparison | **Endorse with a condition** | Right competitor. But do not publish a comparison table against a free product with better distribution — a table invites a like-for-like reading you lose. State the two things they do not attempt, in prose, and move on. |

## The strongest case against this week

Every suggestion is a reaction to something a competitor or a journalist did. Not one comes from
a customer. The field notes now stand at 28, of which 16 are research and 11 are real
conversations — and the research half is driving the roadmap while the customer half sits
unactioned.

Meanwhile: fourteen shipped items, none graded, zero real tasks routed, and two of the most
promising conversations of the project — Ryan and Kai — have gone quiet for eleven days without a
follow-up being sent. Zalando publicly invited contact five days ago and has not been written to.

A week spent on repositioning against Ramp produces no evidence. A week spent landing one pilot
produces the only asset that makes the repositioning true.

## What the radar missed

**The Sonnet 5 error is a process failure, not a data failure, and the brief let itself off
lightly.** Anthropic announced on 10 August. The human verification happened on 13 August and
recorded the old figure. So the ledger was wrong for twelve days on a mainstream model *while
carrying a human-verified badge* — the strongest claim the product makes.

The lesson is not "verify more often". It is that a human reading a pricing page is not more
reliable than an automated check, only differently unreliable, and the badge implies otherwise.
Either the verification agent should cross-check human-verified prices and flag disagreements, or
the badge should say what it actually means: *a person looked, on this date, and people misread
tables.*

That is a bigger and more useful change than anything on this week's list, and it is a
credibility fix on the exact claim the whole product rests on.

**Second thing:** the tokenizer note. Claude 4.7 and later reportedly produce around 30–35% more
tokens for the same text. PerDollar has a `verbosity` field for output length but nothing for
input tokenization differences — so identical prompts are being priced as identical token counts
across models when they are not. That is a systematic error in every comparison involving recent
Claude models, and nobody has mentioned it.

## If you only do one thing

Send the Zalando message. It has been five days since a company with 250+ engineering teams
publicly asked for auto-routing across models and invited non-vendor teams to get in touch. That
door closes as the post ages, and it is the only route to the outcome data that would let you
make the AWpD claim at all.

Everything else on this list will still be true next week.
