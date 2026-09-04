// PerDollar decision engine (B1).
//
// One question: given a task, which model should actually run it?
// Existing routers move traffic where you tell them; the missing piece Ryan named
// is the *decisioning* — picking the cheapest model that is still capable enough,
// from the models this team can actually reach, and saying why.
//
// Pure functions, no I/O, no dependencies: the same logic serves the HTTP
// endpoint, the CLI and the MCP server.

// Minimum capability a task class needs, on the Artificial Analysis index.
// These are honest heuristics, not eval results — stated so, and overridable per
// call. Replacing them with measured pass rates is the eval-harness work (B9).
export const TASK_CLASSES = {
  "code-fix":        { minCapability: 50, tokens: { in: 9000,  out: 1100 }, why: "multi-file reasoning and a correct patch" },
  "code-generate":   { minCapability: 50, tokens: { in: 3500,  out: 2000 }, why: "novel code that must compile and pass tests" },
  "code-review":     { minCapability: 45, tokens: { in: 6000,  out: 1200 }, why: "judgement about correctness and style" },
  "agent-step":      { minCapability: 45, tokens: { in: 12000, out: 700  }, why: "planning over accumulated context" },
  "script":          { minCapability: 40, tokens: { in: 1500,  out: 1000 }, why: "short self-contained code" },
  "support-reply":   { minCapability: 40, tokens: { in: 2500,  out: 450  }, why: "policy-grounded customer-facing text" },
  "summarize":       { minCapability: 0,  tokens: { in: 7000,  out: 600  }, why: "extraction and compression, little reasoning" },
  "translate":       { minCapability: 0,  tokens: { in: 700,   out: 750  }, why: "mechanical transformation" },
  "product-copy":    { minCapability: 0,  tokens: { in: 900,   out: 350  }, why: "short templated generation" },
  "search-answer":   { minCapability: 0,  tokens: { in: 1200,  out: 200  }, why: "ranking and short reformulation, latency-sensitive" },
  "classify":        { minCapability: 0,  tokens: { in: 800,   out: 50   }, why: "label selection from a fixed set" },
};

/**
 * Capability estimate when no third-party score exists (every new model, day one).
 * Four sources, best first — always returns its provenance so a caller can see
 * how much to trust it.
 *
 *  measured  — pass rate observed on this caller's own traffic (best; see ledger)
 *  vendor    — the lab's own published benchmark, discounted for being vendor-run
 *  family    — inherited from the same lab's comparable tier
 *  price     — inferred from where the lab priced it in its own lineup
 */
export function estimateCapability(model, { measured, siblings = [] } = {}) {
  if (model.capability != null)
    return { score: model.capability, basis: "third-party", confidence: "high",
             note: "Artificial Analysis Intelligence Index" };

  if (measured && measured.samples >= 20)
    return { score: Math.round(measured.passRate * 61), basis: "measured", confidence: "high",
             note: `observed ${Math.round(measured.passRate * 100)}% success over ${measured.samples} of your own tasks` };

  if (model.vendor_benchmark != null)
    return { score: Math.round(model.vendor_benchmark * 0.92), basis: "vendor", confidence: "low",
             note: "lab's own benchmark, discounted 8% — vendor-run harnesses flatter their own models" };

  // Price is a decent prior — labs price by tier — but only across comparable
  // price points. Inheriting a flagship's score for a budget sibling is the
  // dangerous direction of error: it routes hard work to a weak model. So we
  // bracket by price and never extrapolate upward.
  const scored = siblings.filter(s => s.capability != null && s.id !== model.id);
  const p = model.output_per_mtok;

  const sameLab = scored.filter(s => s.provider === model.provider)
    .filter(s => s.output_per_mtok / p <= 2 && p / s.output_per_mtok <= 2);
  if (sameLab.length) {
    const near = sameLab.reduce((a, b) =>
      Math.abs(b.output_per_mtok - p) < Math.abs(a.output_per_mtok - p) ? b : a);
    return { score: near.capability, basis: "family", confidence: "medium",
             note: `inferred from ${near.name} — same provider, within 2x on output price` };
  }

  const below = scored.filter(s => s.output_per_mtok <= p).sort((a, b) => b.output_per_mtok - a.output_per_mtok)[0];
  const above = scored.filter(s => s.output_per_mtok > p).sort((a, b) => a.output_per_mtok - b.output_per_mtok)[0];

  if (below && above) {
    const t = (Math.log(p) - Math.log(below.output_per_mtok)) /
              (Math.log(above.output_per_mtok) - Math.log(below.output_per_mtok));
    return { score: Math.round(below.capability + t * (above.capability - below.capability)),
             basis: "price", confidence: "low",
             note: `interpolated between ${below.name} and ${above.name} by output price — a guess, not a measurement` };
  }
  if (above && !below) {
    // Cheaper than everything we have measured. We genuinely do not know, and
    // guessing high is the error that hurts, so we bound it low and say so.
    const floor = Math.min(...scored.map(s => s.capability));
    return { score: null, basis: "unknown-cheap", confidence: "none", bound_below: floor,
             note: `cheaper than every scored model; capability is likely at or below ${floor} but unmeasured — measure it before trusting it with hard tasks` };
  }
  if (below && !above) {
    return { score: below.capability, basis: "price", confidence: "low",
             note: `dearer than every scored model; assumed no worse than ${below.name}` };
  }
  return { score: null, basis: "none", confidence: "none", note: "no basis for an estimate" };
}

/**
 * Turn data/eu-hosts.json into routable options so a residency-constrained query
 * returns an answer instead of a dead end. Each becomes host::model, tagged
 * "tracked" — these are indicative rates from public pages, never quoted as verified.
 */
export function euHostModels(euHosts, { estimateCapabilityFrom = [] } = {}) {
  const byId = Object.fromEntries((euHosts.hosts || []).map(h => [h.id, h]));
  return (euHosts.offerings || [])
    .filter(o => o.inP != null && o.outP != null)
    .map(o => {
      const h = byId[o.host] || {};
      return {
        id: `${o.host}::${o.model}`,
        name: `${o.model} @ ${h.name || o.host}`,
        provider: h.name || o.host,
        input_per_mtok: o.inP, output_per_mtok: o.outP,
        verbosity: 1, capability: null,
        residency: h.residency || "unknown",
        residency_note: h.note || null,
        verification: "tracked",
        source: "EU host public pricing page — indicative, confirm before quoting",
        eu_host: true, country: h.country || null,
      };
    });
}

export function jobCost(model, tokensIn, tokensOut, cacheHitRate = 0) {
  const std = model.input_per_mtok;
  const cached = model.cached_input_per_mtok ?? std;   // conservative when unpublished
  const r = Math.min(Math.max(cacheHitRate, 0), 1);
  const effIn = std * (1 - r) + cached * r;
  const outTokens = tokensOut * (model.verbosity ?? 1);
  return (tokensIn * effIn + outTokens * model.output_per_mtok) / 1e6;
}

/**
 * Decide which model should run a task.
 *
 * @param {object} opts
 *   models          - array from the PerDollar feed
 *   task            - key of TASK_CLASSES, or omit and pass tokens directly
 *   tokensIn/Out    - override the task defaults with real measurements
 *   available       - model ids this team can reach (omit = all)
 *   minCapability   - override the task's floor
 *   excludeLegacy   - drop models the provider has marked legacy (default true)
 *   cacheHitRate    - 0..1, materially changes the ranking on agent workloads
 *   requireVerified - only price rows a human confirmed first-party
 */
export function decide(opts = {}) {
  const {
    models = [], task, tokensIn, tokensOut, available,
    minCapability, excludeLegacy = true, cacheHitRate = 0,
    requireVerified = false, allowUnscored = false, residency,
  } = opts;

  const cls = TASK_CLASSES[task];
  if (!cls && (tokensIn == null || tokensOut == null)) {
    return { error: `unknown task "${task}". Pass a known task or explicit tokensIn/tokensOut.`,
             known_tasks: Object.keys(TASK_CLASSES) };
  }
  const tIn = tokensIn ?? cls.tokens.in;
  const tOut = tokensOut ?? cls.tokens.out;
  const floor = minCapability ?? cls?.minCapability ?? 0;

  const excluded = [];
  const unscoredIncluded = [];

  // Residency first. For an EU buyer "must stay in Germany" is binding and cost
  // optimisation happens strictly inside it — the reverse of how every other
  // router works. RESIDENCY_ALLOWS[requested] lists what satisfies the request.
  // Kai, who sells to these buyers: the constraint is negative. "They don't want
  // the US involved for compliance reasons... in most cases the EU only claim is
  // already fine. Some are so security focused that they want DE. But that is rare."
  // So no-us is the primary axis, eu the common answer, eu-de the edge case.
  const RESIDENCY_ALLOWS = {
    "no-us": ["eu-de", "eu-fr", "eu", "self", "non-eu"],   // anywhere but a US-operated API
    "eu":    ["eu-de", "eu-fr", "eu", "self"],
    "eu-de": ["eu-de", "self"],
    "eu-ok": ["eu-de", "eu-fr", "eu", "self", "global"],
    "any":   null,
  };
  const pool = models.filter(m => {
    if (available && !available.includes(m.id)) { return false; }
    if (residency && residency !== "any") {
      const allowed = RESIDENCY_ALLOWS[residency];
      if (!allowed) { excluded.push({ id: m.id, reason: `unknown residency requirement "${residency}"` }); return false; }
      if (!allowed.includes(m.residency)) {
        excluded.push({ id: m.id, reason: `residency ${m.residency || "unknown"} does not satisfy ${residency}` });
        return false;
      }
    }
    if (requireVerified && m.verification !== "verified") { excluded.push({ id: m.id, reason: "price not first-party verified" }); return false; }
    if (excludeLegacy && m.legacy) { excluded.push({ id: m.id, reason: "provider marked legacy" }); return false; }
    if (floor > 0) {
      if (m.capability == null) {
        // 14 of 24 tracked models have no published score. Excluding them by
        // default is honest — we cannot vouch for what we have not measured —
        // but it can push a caller onto a far dearer model, so it is opt-in
        // and always reported.
        if (!allowUnscored) { excluded.push({ id: m.id, reason: "no published capability score" }); return false; }
        unscoredIncluded.push(m.id);
      }
      else if (m.capability < floor) { excluded.push({ id: m.id, reason: `capability ${m.capability} below floor ${floor}` }); return false; }
    }
    return true;
  });

  // Residency fallback: every EU-resident host is unscored today, so a jurisdiction
  // query with a capability floor excludes them all and returns "nothing" — which is
  // false and unhelpful. Retry with unscored allowed and warn prominently instead.
  if (!pool.length && residency && residency !== "any" && !allowUnscored && floor > 0) {
    const retry = decide({ ...opts, allowUnscored: true });
    if (!retry.error) {
      retry.warnings = [
        `No model with a published capability score satisfies residency "${residency}", so unscored models were included. ` +
        `The pick below is compliant and cheap but its capability is unmeasured — sample it before trusting it with work that needs a ${floor}+ model.`,
        ...(retry.warnings || []),
      ];
      retry.capability_unverified = true;
      return retry;
    }
  }

  if (!pool.length) {
    return { error: "no model satisfies these constraints", floor, excluded,
             hint: residency && residency !== "any"
               ? `no tracked model satisfies residency "${residency}". EU-resident open-weight hosting (IONOS, Scaleway, OVHcloud, STACKIT) is in data/eu-hosts.json and is usually the answer here.`
               : "lower minCapability, allow legacy models, or widen `available`" };
  }

  const priced = pool
    .map(m => ({ model: m, cost: jobCost(m, tIn, tOut, cacheHitRate) }))
    .sort((a, b) => a.cost - b.cost);

  const pick = priced[0];
  const runnerUp = priced[1] || null;

  return {
    recommended: {
      id: pick.model.id, name: pick.model.name, provider: pick.model.provider,
      capability: pick.model.capability ?? null,
      residency: pick.model.residency ?? null,
      residency_note: pick.model.residency_note ?? null,
      cost_per_job: round(pick.cost),
      verification: pick.model.verification, verified_at: pick.model.verified_at ?? null,
    },
    reason: (() => {
      const need = cls?.why ?? "this task";
      const nScored = priced.filter(p => p.model.capability != null).length;
      const nUnscored = priced.length - nScored;
      if (floor <= 0)
        return `cheapest of ${priced.length} eligible models; this task class has no capability floor (${need})`;
      // Only claim a model clears the floor if it actually has a score.
      if (pick.model.capability == null)
        return `cheapest of ${priced.length} eligible models. This task needs ${floor}+ (${need}), but the pick has no published capability score — ` +
               `${nScored} scored model${nScored === 1 ? "" : "s"} cleared the floor and ${nUnscored} unscored were included at your request, and this was cheapest of all of them.`;
      if (nUnscored > 0)
        return `cheapest of ${priced.length} eligible models for a ${floor}+ task (${need}); ` +
               `it scores ${pick.model.capability}, though ${nUnscored} of the options considered have no score at all.`;
      return `cheapest of ${priced.length} models scoring ${floor}+ (needed for ${need})`;
    })(),
    runner_up: runnerUp ? {
      id: runnerUp.model.id, name: runnerUp.model.name,
      cost_per_job: round(runnerUp.cost),
      pct_more: Math.round((runnerUp.cost / pick.cost - 1) * 100),
    } : null,
    assumptions: {
      task: task ?? "custom", tokens_in: tIn, tokens_out: tOut,
      min_capability: floor, cache_hit_rate: cacheHitRate,
      residency: residency || "any",
      capability_floors_are: "heuristics, not measured pass rates — validate on your own traffic before relying on them",
      output_tokens_scaled_by: "each model's answer-length factor",
    },
    warnings: [
      ...(excluded.filter(e => e.reason === "no published capability score").length && !allowUnscored
        ? [`${excluded.filter(e => e.reason === "no published capability score").length} models were excluded only because they have no published capability score — they may well be cheaper and adequate. Set allow_unscored=true to include them.`] : []),
      ...(unscoredIncluded.length
        ? [`included ${unscoredIncluded.length} model(s) with no capability score at your request: ${unscoredIncluded.join(", ")}`] : []),
    ],
    excluded: excluded.slice(0, 12),
    considered: priced.slice(0, 5).map(p => ({ id: p.model.id, cost_per_job: round(p.cost),
      capability: p.model.capability ?? null })),
  };
}

/**
 * T1.3 — budget adherence.
 *
 * Every other router minimises cost. That is not how the buyer thinks: they
 * allocate a budget ("$500 per developer per month") and then, in Kai's words,
 * "they hope". So invert the optimisation — spend the budget, don't shrink it:
 * pick the MOST capable model whose projected monthly spend still fits.
 *
 * Cursor and Copilot do this internally to stay inside a subscription. This is
 * the same mechanic pointed outward, at a budget the customer sets.
 *
 * @param budget      total monthly budget in dollars
 * @param volume      expected jobs per month
 * @param spentSoFar  already spent this month (from the ledger)
 * @param elapsed/of  days elapsed and days in the month, for pacing
 */
export function planBudget(opts = {}) {
  const {
    models = [], task, tokensIn, tokensOut, budget, volume,
    spentSoFar = 0, elapsedDays = 0, daysInMonth = 30,
    reserve = 0.1,                       // hold back 10% for spikes
    ...rest
  } = opts;

  if (!(budget > 0) || !(volume > 0))
    return { error: "planBudget needs a positive monthly budget and expected volume" };

  // What is actually left, and for how many jobs.
  const remaining = Math.max(0, budget * (1 - reserve) - spentSoFar);
  const jobsDone = elapsedDays > 0 ? Math.round(volume * (elapsedDays / daysInMonth)) : 0;
  const jobsLeft = Math.max(1, volume - jobsDone);
  // The ceiling IS the correction: money already burned is money the rest of the
  // month cannot spend, so overspending early automatically lowers what the
  // remaining jobs may cost. No separate throttle needed.
  const ceiling = remaining / jobsLeft;

  const cls = TASK_CLASSES[task];
  const tIn = tokensIn ?? cls?.tokens.in;
  const tOut = tokensOut ?? cls?.tokens.out;
  if (tIn == null || tOut == null)
    return { error: `unknown task "${task}" and no explicit token counts` };

  // Reuse decide() for eligibility (residency, legacy, capability, availability),
  // then choose differently: best capability that fits, not cheapest overall.
  const base = decide({ models, task, tokensIn: tIn, tokensOut: tOut, ...rest });
  if (base.error) return base;

  const eligible = models.filter(m => base.considered.some(c => c.id === m.id) ||
    !base.excluded.some(e => e.id === m.id));
  const priced = eligible
    .map(m => ({ m, cost: jobCost(m, tIn, tOut, rest.cacheHitRate ?? 0) }))
    .filter(p => Number.isFinite(p.cost) && p.cost > 0)
    .sort((a, b) => a.cost - b.cost);

  const affordable = priced.filter(p => p.cost <= ceiling);
  const cheapest = priced[0];

  // Among what fits, take the most capable; ties break toward the cheaper.
  const best = affordable.length
    ? affordable.reduce((a, b) => {
        const ca = a.m.capability ?? -1, cb = b.m.capability ?? -1;
        if (cb !== ca) return cb > ca ? b : a;
        return b.cost < a.cost ? b : a;
      })
    : null;

  const pick = best || cheapest;
  const projected = pick.cost * volume;
  const overBy = projected - budget;

  return {
    recommended: {
      id: pick.m.id, name: pick.m.name, provider: pick.m.provider,
      capability: pick.m.capability ?? null,
      cost_per_job: round(pick.cost),
      residency: pick.m.residency ?? null,
    },
    fits: !!best,
    budget: {
      monthly: budget, reserve_pct: Math.round(reserve * 100),
      spent_so_far: round(spentSoFar),
      remaining_after_reserve: round(remaining),
      jobs_remaining: jobsLeft,
      ceiling_per_job: round(ceiling),
      projected_month_total: round(projected),
      projected_vs_budget_pct: Math.round((projected / budget) * 100),
    },
    verdict: best
      ? (spentSoFar > 0
          ? `${pick.m.name} is the most capable model that fits the $${round(ceiling)}/job left after $${round(spentSoFar)} already spent`
          : `${pick.m.name} is the most capable model that fits — projected ${Math.round((projected / budget) * 100)}% of budget`)
      : `nothing fits this budget. The cheapest option (${pick.m.name}) still projects $${round(projected)}, ` +
        `$${round(overBy)} over. Raise the budget, cut volume, or accept the overrun.`,
    pacing: elapsedDays > 0
      ? (() => {
          const expected = budget * (elapsedDays / daysInMonth);
          const pace = expected > 0 ? spentSoFar / expected : 0;
          return { on_track: pace <= 1.05, pace_vs_plan: Math.round(pace * 100) + "%",
            note: pace > 1.05 ? "burning faster than plan — this pick is already tightened to compensate"
                : pace < 0.8 ? "under plan — a more capable model is affordable"
                : "on plan" };
        })()
      : null,
    // Ranked the way the pick was made — by capability among what fits — so the list
    // explains the recommendation instead of contradicting it.
    alternatives: [...priced]
      .sort((a, b) => {
        const af = a.cost <= ceiling, bf = b.cost <= ceiling;
        if (af !== bf) return af ? -1 : 1;                       // affordable first
        const ca = a.m.capability ?? -1, cb = b.m.capability ?? -1;
        if (cb !== ca) return cb - ca;                            // then most capable
        return a.cost - b.cost;                                   // then cheapest
      })
      .filter(p => p.m.id !== pick.m.id)
      .slice(0, 4)
      .map(p => ({
        id: p.m.id, name: p.m.name, capability: p.m.capability ?? null,
        cost_per_job: round(p.cost), month_total: round(p.cost * volume),
        fits: p.cost <= ceiling,
      })),
    assumptions: { task: task ?? "custom", tokens_in: tIn, tokens_out: tOut, volume,
      note: "projection assumes the stated volume and token profile; the ledger's real numbers should replace them once routing has run" },
  };
}

/**
 * B2 — counterfactual saving for one completed task.
 * The developer's habit is the baseline: what would this have cost on the model
 * they would have reached for anyway? No A/B test and no eval harness needed,
 * because both numbers are known once the work is done.
 */
export function counterfactual({ models = [], usedId, defaultId, tokensIn, tokensOut, cacheHitRate = 0 }) {
  const used = models.find(m => m.id === usedId);
  const dflt = models.find(m => m.id === defaultId);
  if (!used) return { error: `unknown model "${usedId}"` };
  if (!dflt) return { error: `unknown default model "${defaultId}"` };

  const actual = jobCost(used, tokensIn, tokensOut, cacheHitRate);
  // Same prompt, other model: input tokens are shared, output scales by that
  // model's own verbosity — which jobCost already applies.
  const would = jobCost(dflt, tokensIn, tokensOut, cacheHitRate);

  return {
    used: { id: used.id, name: used.name, cost: round(actual) },
    would_have_used: { id: dflt.id, name: dflt.name, cost: round(would) },
    saved: round(would - actual),
    saved_pct: would > 0 ? Math.round((1 - actual / would) * 100) : 0,
    caveat: "counterfactual assumes the same input tokens on both models and scales output by each model's answer-length factor; it does not model a retry that a weaker model might have needed",
  };
}

function round(v) { return Math.round(v * 1e6) / 1e6; }
