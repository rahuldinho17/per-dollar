# Navigara — who to approach and how

## The person: Jirka Bachel, Founder & CEO

Former CTO and systems engineer, co-founded Navigara in 2025, raised $2.5M seed led by Rockaway
Ventures. HQ in San Francisco with engineering operations in Europe (Rockaway is Czech; their
customer list — Kiwi.com, ESET, FTMO, Partners Banka — is Czech and Slovak).

**Why him rather than the co-founder:** a data partnership is a strategic call, and he is
visibly hands-on — he posted their Product Hunt launch personally two days ago and is answering
comments in the thread himself. His founding story is also the exact problem you solve, in his
own words:

> *"A CFO asked whether Claude was producing real value for almost $150k a month or just
> producing invoices, and the honest answer was 'we think so.'"*

The other co-founder is **Peter**, ex-Director of Engineering at Kiwi.com where he ran a
50-person platform group. Worth knowing as a second route — European commerce background, closer
to the technical integration — but Jirka is the first call.

## Where to reach him

**Product Hunt, in the launch thread — the best channel this week.** He is actively replying
there right now, it is public, and a substantive comment costs him nothing to answer. Momentum
decays fast; this window is roughly a week.
`producthunt.com/products/navigara`

**LinkedIn.** Both founders' profiles are linked from `navigara.com/about`. I could not verify
his profile URL directly, so take it from that page rather than a search result — there are
several people with similar names.

**Email.** I could not find a published address, and I am not going to invent one. `jirka@navigara.com`
matches the usual pattern for a company this size and is worth one attempt, but treat it as a
guess. The contact form on their site is the reliable fallback.

**Order I would use:** reply in the Product Hunt thread first (public, low friction, he is
there), then LinkedIn if that goes quiet after a few days.

## The message

> Jirka — the CFO line in your launch post is the reason I built what I built. I came at the same
> problem from the other end: you measure what the spend produced, I measure what it should have
> cost.
>
> PerDollar is a verified price and decision layer — 19 models, each carrying who checked the
> price and when, plus EU-resident hosting that appears in no aggregator. Free JSON feed, no auth:
> **per-dollar.vercel.app/feed/prices.json**
>
> The reason I am writing rather than just admiring: your Token Spend Intelligence feature has to
> price tokens from somewhere, and that data rots faster than anyone expects. Two from the last
> fortnight — DeepSeek moved to peak/off-peak billing and raised rates 3–5×, and the Gemini Flash
> line is on an introductory window with a doubling scheduled, so anyone treating today's number
> as standard is out by 2× in January. Every comparison site I check is still publishing the old
> DeepSeek figures. If your ETV-per-dollar is computed on stale prices, the denominator is wrong
> and nobody would know.
>
> The feed is free with attribution whether or not we ever talk. But there is an obvious shape
> here: you have the output side and the customers, I have verified input data and EU coverage
> that a US-headquartered platform would take months to assemble.
>
> One more thing — the metric-gaming comment on your thread landed for me. I ship a metric that
> counts accepted tasks, and someone pointed out within two days that tasks are activity, so
> splitting work into smaller pieces improves it without improving anything. I now report task-size
> distribution beside it so a shrinking denominator is visible. Different metric, same trap.
>
> Worth 20 minutes?

## Why this shape

**It opens with his own words, not yours.** The CFO quote is the founding story he tells; leading
with it says you actually read the thing.

**It gives before it asks.** The feed is free with attribution regardless — stated plainly, so
the offer is not contingent on a deal.

**The two price examples are the whole pitch.** DeepSeek's repricing and the Gemini introductory
window are specific, checkable, recent, and directly threaten the accuracy of a feature he ships.
That is a more persuasive argument for verified pricing than any claim about verification.

**The metric-gaming paragraph is the strongest part.** A commenter on his own thread raised
exactly that objection about ETV, and you volunteer the same flaw in your own metric plus what you
did about it. Founders trust people who name their own weaknesses; it also establishes you as a
peer working on the same problem rather than a vendor.

**The ask is 20 minutes**, not a partnership. Partnerships get negotiated after someone has
decided they like you.

## One caution

They are a competitor as well as a complement — their Token Spend feature is your product in
miniature. Do not send anything you would mind them reading closely. The feed is public anyway,
so nothing here gives away more than the website already does, and the EU host coverage plus
provenance discipline is not something a two-day conversation lets them copy.
