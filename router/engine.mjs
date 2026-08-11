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
  const RESIDENCY_ALLOWS = {
    "eu-de": ["eu-de", "self"],
    "eu":    ["eu-de", "eu-fr", "eu", "self"],
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
    reason: floor > 0
      ? `cheapest of ${priced.length} models scoring ${floor}+ (needed for ${cls?.why ?? "this task"})`
      : `cheapest of ${priced.length} eligible models; this task class has no capability floor (${cls?.why ?? "caller-specified"})`,
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
        ? [`${excluded.filter(e => e.reason === "no published capability score").length} models were excluded only because they have no published capability score — they may well be cheaper and adequate. Set allowUnscored to include them.`] : []),
      ...(unscoredIncluded.length
        ? [`included ${unscoredIncluded.length} model(s) with no capability score at your request: ${unscoredIncluded.join(", ")}`] : []),
    ],
    excluded: excluded.slice(0, 12),
    considered: priced.slice(0, 5).map(p => ({ id: p.model.id, cost_per_job: round(p.cost),
      capability: p.model.capability ?? null })),
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
