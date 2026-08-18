# PerDollar + LiteLLM

LiteLLM routes across 100+ providers but, as its own reviewers put it, you still choose
which model to call — routing logic must be built on top. PerDollar is that logic, and it
stays outside the request path.

## Keep model costs current

LiteLLM prices requests from a static cost map that ages. Refresh it from the verified feed:

```python
import requests, litellm

feed = requests.get("https://per-dollar.vercel.app/feed/prices.json", timeout=10).json()

# PerDollar publishes $/1M tokens; LiteLLM wants $/token.
litellm.register_model({
    m["name"]: {
        "input_cost_per_token":  m["input_per_mtok"]  / 1_000_000,
        "output_cost_per_token": m["output_per_mtok"] / 1_000_000,
        "litellm_provider": m["provider"].lower(),
    }
    for m in feed["models"]
    # only trust prices a human or the daily agent actually confirmed
    if m["verification"] in ("verified", "agent-verified")
})
```

Run it on a schedule. `feed["as_of"]` tells you when the data was last checked, so you can
alarm if it stops moving.

## Choose the model before you call

```python
def pick(task, residency=None, available=None):
    r = requests.get("https://per-dollar.vercel.app/api/decide", params={
        "task": task,                      # code-fix, support-reply, summarize, ...
        "residency": residency,            # eu-de | eu | eu-ok | any
        "available": ",".join(available) if available else None,
        "allow_unscored": "true",
    }, timeout=5).json()
    return r["recommended"]["name"], r["reason"]

model, why = pick("support-reply", residency="eu")
response = litellm.completion(model=model, messages=[...])
```

Log `why` alongside the call. It is the difference between "we saved money" and an audit trail.

## Notes

- Models with no published capability score are excluded when a task has a quality floor
  unless you pass `allow_unscored=true`; the response says which were included either way.
- EU-resident hosts are marked `tracked`, not `verified` — indicative rates from public
  pages. Confirm before you rely on them commercially.
