// Shared by the daily refresh and the daily price check, so the public feed is
// always rewritten after the last step that changes data/prices.json.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DISPLAY = {
  gpt56sol:["GPT-5.6 Sol","OpenAI"], fable5:["Claude Fable 5","Anthropic"],
  gpt55:["GPT-5.5","OpenAI"], opus48:["Claude Opus 4.8","Anthropic"],
  gpt56ter:["GPT-5.6 Terra","OpenAI"], gpt54:["GPT-5.4","OpenAI"],
  son5:["Claude Sonnet 5","Anthropic"], son46:["Claude Sonnet 4.6","Anthropic"],
  kimik3:["Kimi K3","Moonshot AI"], gem31p:["Gemini 3.1 Pro","Google"],
  grok45:["Grok 4.5","xAI"], grok46:["Grok 4.6","xAI"], inkling:["Inkling","Thinking Machines"],
  gpt56lun:["GPT-5.6 Luna","OpenAI"], gem36f:["Gemini 3.6 Flash","Google"],
  gem37f:["Gemini 3.7 Flash","Google"],
  glm52:["GLM-5.2","Z.AI"], haiku45:["Claude Haiku 4.5","Anthropic"],
  mm3:["MiniMax M3","MiniMax"], gem3f:["Gemini 3 Flash","Google"],
  g41mini:["GPT-4.1 Mini","OpenAI"], dsv4f:["DeepSeek V4 Flash","DeepSeek"],
  g41nano:["GPT-4.1 Nano","OpenAI"], dsv4pro:["DeepSeek V4 Pro","DeepSeek"],
  opus5:["Claude Opus 5","Anthropic"], gem31fl:["Gemini 3.1 Flash-Lite","Google"],
};

export const FEED_DISCLAIMER =
  "Standard-tier first-party API list prices, checked automatically every day by a bot — no human checks. " +
  "'confirmed' = on checked_at the bot found this exact price either on the provider's own pricing page " +
  "(check_source 'provider-page') or listed by OpenRouter (check_source 'openrouter'); " +
  "'unconfirmed' = the bot checked on checked_at but could not confirm it — see check_note and confirmed_at. " +
  "Promotional prices are separate from standard. Not financial advice.";

// The feed carries fields the pipeline does not own (capability, verbosity,
// legacy, cached/off-peak rates, pricing notes). Earlier versions rebuilt the
// feed from data/prices.json alone and would have silently dropped them on the
// first successful run. So: start from the existing feed entry, overwrite only
// what the pipeline owns, and drop the retired human-verification fields.
const RETIRED = ["verified_at", "agent_checked_at", "agent_status", "agent_note", "tracked_at"];

export function writePublicFeed(prices, ROOT) {
  const path = join(ROOT, "feed", "prices.json");
  let old = {};
  try { old = JSON.parse(readFileSync(path, "utf8")); } catch {}
  const prev = new Map((old.models || []).map((m) => [m.id, m]));

  const models = prices.models.map((m) => {
    const [name, provider] = DISPLAY[m.id] || [prev.get(m.id)?.name ?? m.id, prev.get(m.id)?.provider ?? "?"];
    const e = { ...(prev.get(m.id) || {}) };
    for (const k of RETIRED) delete e[k];
    Object.assign(e, { id: m.id, name, provider,
      input_per_mtok: m.inP, output_per_mtok: m.outP,
      verification: m.verification || "unconfirmed",
      checked_at: m.checked_at ?? null, check_source: m.check_source ?? null,
      confirmed_at: m.confirmed_at ?? null, check_note: m.check_note ?? null,
      source: m.source ?? null,
      residency: m.residency ?? e.residency ?? null,
      residency_note: m.residency_note ?? e.residency_note ?? null });
    if (m.promoIn != null) e.promo = { input_per_mtok: m.promoIn, output_per_mtok: m.promoOut, ends: m.promoEnds ?? null };
    else delete e.promo;
    return e;
  });

  const fields = { ...(old.fields || {}), verification:
    "confirmed = on checked_at the bot found this exact price on the provider's own page (check_source provider-page) or listed by OpenRouter (check_source openrouter); unconfirmed = the bot checked on checked_at but could not confirm it — see check_note, and confirmed_at for the last time it was confirmed",
    checked_at: "date of the bot's most recent automatic check; the bot runs daily" };

  const feed = {
    "$schema": old["$schema"] || "https://per-dollar.vercel.app/feed/prices.json",
    feed: "perdollar-prices", version: "1.1",
    as_of: prices.as_of, checked_at: prices.checked_at ?? null,
    currency: "USD", unit: "per_million_tokens",
    license: "Free to use with attribution to PerDollar (per-dollar.vercel.app).",
    disclaimer: FEED_DISCLAIMER,
    models,
    last_change: prices.last_change ?? old.last_change ?? null,
    fields,
  };
  writeFileSync(path, JSON.stringify(feed, null, 2) + "\n");
}
