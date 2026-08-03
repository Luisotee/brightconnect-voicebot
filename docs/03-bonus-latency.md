# Bonus — Cutting Average Latency by 40%

**Deliverable 4 of 4 (optional)**

> *"BrightConnect wants to reduce average latency by 40% while maintaining natural conversation
> quality. What specific changes would you make to your provider stack or architectural design?"*

Measured baseline, from 13 real Vapi calls / 31 turns via Vapi's own per-call metrics: median turn
latency **1977ms**, average **2188ms** — well above the original ~800ms no-tool-turn target, because
nearly every real call fires a tool almost immediately. A 40% cut against this real baseline means
finding **~790–875ms**, not the ~320ms a plain reading of the original target would suggest.

## Tier 1 — Configuration (~150–220ms, no quality cost)

Already-wrong defaults, not optimizations: `startSpeakingPlan.waitSeconds` 0.3 → 0.1 (**~200ms**, the
single biggest line item, and a default nobody changed); `eotThreshold` 0.7 → 0.6 (~50–100ms, watch
interruption rate); trim the system prompt while keeping it byte-stable so prefix caching still
engages; `maxTokens` 250 → 120 shortens the *end* of every turn.

## Tier 2 — Architecture (~100–300ms on the turns that matter)

**Skip identification when the caller ID is already known** — resolve account context while the
phone is still ringing, deleting an entire `lookupAccount` round trip from the first substantive turn.
Highest-value single change in this document, because it removes a question rather than speeding one
up. Also: speculative prefetch of `lookupAccount` as soon as intent is confident; two-tier model
routing (a smaller model for mechanical turns, the full model for diagnosis and escalation decisions);
async execution for anything not spoken aloud.

## Tier 3 — Provider swaps (~50–100ms, needs measuring first)

Regional colocation of model, TTS and transcriber with the telephony edge. Cartesia Sonic 3.5 vs.
ElevenLabs Flash v2.5 — comparable published figures from different parties measuring differently;
this is an A/B to run on real traffic, not a win to assume.

## Tier 4 — Perceived latency (worth more than it costs)

Tool fillers (already shipped — every tool speaks before it runs). Clause-level TTS streaming so
audio starts at the first natural break rather than the end of the sentence. Light background
ambience so silence between turns doesn't read as a dropped call.

## Where I'd stop

Optimize p50 *and* p95, never the mean — a mean can improve while the worst 5% of calls get worse.
Ship every change against a control group, watching interruption rate, containment rate, no-match
rate, escalation rate by reason, and call duration — not just the raw latency number.

Against the real ~2000ms baseline, Tiers 1–2 add up to **~15–25%** with no quality cost. Reaching 40%
needs either Tier 3 provider swaps validated by A/B testing, or accepting a measurable rise in
interruption rate — a trade I'd want a stakeholder to knowingly sign off on, not one hidden inside a
config change. Hitting a latency target by making the bot talk over customers isn't a win; it's the
same failure in a different metric.
