// node scripts/check.test.mjs — tests for the daily automatic price check.
import { decide, SOURCES } from "./verify-agent.mjs";
const today = new Date().toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (name, c) => { c ? pass++ : (fail++, console.log("FAIL", name)); };
const pad = " lorem ipsum ".repeat(30);
const src = SOURCES.opus5;
const page = (t) => ({ text: pad + t + pad });
const m = (x = {}) => ({ id: "opus5", inP: 5, outP: 25, ...x });

let d = decide(m(), page("Claude Opus 5 Input $5 / MTok Output $25 / MTok"), src);
ok("provider page confirms", d.status === "confirmed" && d.via === "provider-page");

d = decide(m({ or_check: { date: today, listed: true, inP: 5, outP: 25 } }), { text: "", err: "HTTP 403" }, src);
ok("OpenRouter confirms when page unreadable", d.status === "confirmed" && d.via === "openrouter");

d = decide(m({ or_check: { date: "2020-01-01", listed: true, inP: 5, outP: 25 } }), { text: "", err: "HTTP 403" }, src);
ok("stale OpenRouter reading never confirms", d.status === "unconfirmed");

d = decide(m({ or_check: { date: today, listed: true, inP: 4, outP: 25 } }), page("nothing here"), src);
ok("OpenRouter disagreeing is unconfirmed", d.status === "unconfirmed" && /OpenRouter lists \$4/.test(d.why));

d = decide(m({ promoIn: 2.5, promoOut: 12.5, or_check: { date: today, listed: true, inP: 2.5, outP: 12.5 } }), page(""), src);
ok("OpenRouter showing the promo counts", d.status === "confirmed");

d = decide(m({ pending_price: { inP: 8, seen_at: today } , or_check: { date: today, listed: true, inP: 8, outP: 25 } }),
  page("Claude Opus 5 Input $8 / MTok Output $25 / MTok"), src);
ok("parked move applied when provider page shows it", d.status === "confirmed" && d.apply?.inP === 8);

d = decide(m({ pending_price: { inP: 8, seen_at: today }, or_check: { date: today, listed: true, inP: 8, outP: 25 } }),
  { text: "", err: "HTTP 403" }, src);
ok("parked move never applied on OpenRouter's word", d.status === "unconfirmed" && !d.apply);

d = decide(m(), page("Claude Opus 5 is great"), src);
ok("silence is not consent", d.status === "unconfirmed");

d = decide({ id: "zzz", inP: 1, outP: 2 }, { text: "", err: "no source" }, undefined);
ok("no source configured is unconfirmed", d.status === "unconfirmed");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
