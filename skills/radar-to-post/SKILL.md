---
name: radar-to-post
description: >
  Turn the week's market-radar brief into a short LinkedIn post for an external audience.
  Use immediately after running the market radar, or when the user asks to draft/publish the
  weekly post, share this week's findings, or write the radar post. Reads the newest brief in
  skills/market-radar/briefs/, picks the one finding an outsider would care about, and drafts
  a post that sounds like a person rather than a content calendar. Never publishes anything —
  it drafts, the user posts.
---

# Radar → post

The market radar already does the expensive part: reading the week and deciding what matters.
This turns that into distribution, weekly, at almost no marginal cost. Most of the brief is
internal — decisions, backlog, memory. One item in it is usually interesting to people who
have never heard of PerDollar. Find that item and write about it.

## The job

Read the newest file in `skills/market-radar/briefs/`. Choose **one** finding — not a summary,
not a round-up. Write a post about that finding which happens to mention PerDollar, rather than
a post about PerDollar that mentions a finding.

Then log it, so the next post does not repeat this one.

## Choosing the finding

Rank candidates by what an outsider would stop scrolling for:

1. **A number that contradicts something people believe.** "The cheap tier is getting more
   expensive" beats "prices keep falling" because the reader thinks they know the answer.
2. **A gap nobody has named.** EU-resident hosting appearing in no aggregator. The reader
   learns something they cannot get elsewhere.
3. **A big story with a different read.** Newsjacking works when the take is genuinely
   different, not when it is the same take with your logo on it.
4. **Something PerDollar got wrong and published.** Corrections are the most trusted and least
   used content in this category.

Skip: competitor feature launches (reads as insecurity), anything without a specific figure,
anything requiring the reader to already care about PerDollar.

## Writing it

Aim for 120–200 words. The shape that works:

- **Line one is the finding**, stated flatly. No preamble, no "I've been thinking about".
- **Two or three lines of substance** — the number, where it came from, why it is surprising.
- **One line of context** about how you ran into it, which is where PerDollar enters.
- **The link**, mid-post rather than at the end.
- **A real question** to close. Not "thoughts?" — a question you actually want answered, which
  the right reader can answer from their own experience.

## Sounding human

The tell-tale signs of generated copy, all avoidable:

- Do not open with "Here's the thing" or "Let that sink in"
- Do not put every sentence on its own line for emphasis
- No emoji bullets, no numbered listicles, no bold-heavy scanning
- Do not use three-part parallel structures repeatedly
- Never "I'm excited to announce" or "game-changing" or "the future of"
- Vary sentence length. Include at least one sentence that runs long and one that is four words
- Specific beats sweeping: "one CTO scrapes those prices by hand, weekly" beats "teams struggle
  with pricing data"
- Admitting a limitation or a mistake makes the rest credible; include one where honest

If the draft could have been written about any company in the category, it is wrong. Rewrite
around the detail only PerDollar has.

## Output

Give the user:

1. **The post**, ready to paste, in a message-compose block.
2. **One line on why that finding**, so they can overrule the choice.
3. **A first comment** to post themselves — the link if it is not already in the body, or the
   supporting number that did not fit. LinkedIn suppresses posts with external links in the
   body, so the comment is where a second link goes.
4. **Timing**, if the finding is news-dependent. A newsjack has a window measured in days.

## Recording it

Append to `skills/market-radar/posts.json`:

```json
{ "date": "2026-08-18", "brief": "2026-08-18.md", "finding": "one line",
  "angle": "contradiction | gap | newsjack | correction", "posted": false, "notes": "" }
```

Before drafting, read that file. Do not reuse an angle from the last three weeks, and never
reuse a finding. If the newest brief has nothing an outsider would care about, say so and skip
the week — a missed post costs nothing, a boring one costs attention.

## Guardrails

- **Every figure must trace to the brief or the repo.** If a number is not sourced, cut it.
- **Never claim compliance, certification or a partnership that does not exist.**
- **Do not name a prospect or quote a private conversation** without asking. "One CTO told me"
  is fine; naming the company is not.
- **Do not publish.** Draft only. The user posts, and posting from their own account is what
  makes it theirs.
