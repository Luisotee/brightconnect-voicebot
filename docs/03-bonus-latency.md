# Bonus — Cutting Average Latency by 40%

**Deliverable 4 of 4**

> *"BrightConnect wants to reduce average latency by 40% while maintaining natural conversation
> quality. What specific changes would you make to your provider stack or architectural design?"*

**Grounded in what was actually measured**, not the original target: `01-technical-reasoning.md` now
has real numbers pulled from Vapi's own per-call metrics across the 13 test calls placed during
development — a median turn latency of **1977ms**, average **2188ms**. The original ~800ms p50 target
was for a no-tool conversational turn; in practice, almost every real call here fires a tool within
the first couple of turns (`lookupAccount` resolves identity, plan, outage and balance in one shot, so
it fires early regardless of intent), so the honest baseline for "a typical turn in this bot" is much
closer to the 1.2–1.8s tool-turn target than the 800ms conversational one — and the real median sits
slightly above even that.

Baseline for this exercise, then, is **~2000ms**. A 40% cut means finding **~790–875ms** — a
materially harder number than the original 320ms framing implied. Below is where I would take it, in
the order I would actually do it — cheapest and safest first — with what each is worth and what each
costs.

The framing matters: **the second half of the target is not the same problem as the first.** Getting
to 20% is config work with no downside. Getting to 40% starts trading against conversation quality,
and the job is knowing which trades to refuse.

---

## Tier 1 — Configuration (~150–220ms, no quality cost)

These are already-wrong defaults, not optimisations.

| Change | Worth | Cost |
|---|---|---|
| `startSpeakingPlan.waitSeconds` 0.3 → 0.1 | **~200ms** | Slightly more likely to clip a caller drawing breath mid-sentence. Measure interruption rate. |
| `eotThreshold` 0.7 → 0.6 | ~50–100ms | Flux ends turns sooner. Hesitant or elderly callers get cut off more. **Guardrail: interruption rate.** |
| Trim the system prompt (~5.6k chars → ~3k) and keep it byte-stable | ~20–50ms | Real work — the rules have to survive the edit. Prefix caching only engages on an unchanged prefix. |
| `maxTokens` 250 → 120 | Shortens turn *end*, not TTFT | Ava already speaks in one or two sentences; this enforces it. |

**The single biggest item is `waitSeconds`, and it is a default nobody changed.** That is typical: the
first 20% of a latency programme is usually undoing defaults rather than engineering anything.

---

## Tier 2 — Architecture (~100–300ms on the turns that matter)

Tier 1 speeds up every turn a little. Tier 2 removes work entirely from the turns that are worst.

**Skip identification when you already know who is calling.** On inbound telephony the caller ID is
known before anyone speaks. Passing it in `assistantOverrides.variableValues` at call start lets the
account context be resolved *while the phone is still ringing* — deleting an entire `lookupAccount`
round trip (100–300ms) from the first substantive turn, plus the turn spent asking for a phone number.
This is the highest-value change in the whole document and it removes a question rather than
speeding one up.

**Speculative prefetch.** Fire `lookupAccount` as soon as intent is confident, concurrently with the
model's reply, instead of sequentially after it. Costs a few wasted calls when intent is misread —
against a fixture-backed internal service, that is cheap.

**Two-tier model routing.** Gemini 3.1 Flash-Lite for the mechanical turns (identity capture,
confirmations, yes/no), the full Flash model for diagnosis and escalation decisions. Most turns in a
support call are mechanical.

**Async where the result is not spoken.** `escalateToHuman` returns a ticket ID Ava reads aloud, so it
must block. Analytics and logging writes must not.

---

## Tier 3 — Provider swaps (~50–100ms, needs measuring first)

- **Regional colocation.** Model, TTS and transcriber in the same region as the telephony edge.
  Cross-region hops are invisible in local testing and very visible in production p95.
- **Cartesia Sonic 3.5 vs ElevenLabs Flash v2.5.** Published figures put these in the same class
  (sub-90ms vs ~75ms) but measured by different parties under different conditions. This is an A/B
  to run on our own traffic, **not a win to assume** — and I would rather say so than claim a number
  I have not verified.
- **Flux `eotThreshold` retune after any TTS change**, since perceived responsiveness is the sum of
  both and tuning them independently double-counts.

---

## Tier 4 — Perceived latency (worth more than it costs)

Real milliseconds are expensive. Perceived milliseconds are cheap, and callers experience only the
perceived kind.

- **Tool fillers** — already in this build. Every tool speaks before it runs, and the slow diagnostic
  explicitly sets a longer expectation ("this takes a few seconds"). A 2-second wait that was
  announced is more comfortable than an 800ms silence that was not.
- **Clause-level TTS streaming** so audio starts at the first natural break rather than the end of
  the sentence.
- **Light background ambience.** Total silence between turns reads as a dropped call; faint room
  tone reads as a person thinking.

---

## The part that decides whether any of it worked

**Optimise p50 *and* p95, never the mean.** A mean can improve while the worst 5% of calls — the ones
that generate complaints — get worse. Averages hide exactly the failures you are trying to fix.

**Ship every change against a control group**, measured on:

| Metric | Watching for |
|---|---|
| p50 / p95 turn latency | The actual target |
| **Interruption rate** | The direct cost of aggressive endpointing. The one that catches a bad `eotThreshold`. |
| **Containment rate** | Whether faster responses are still *correct* ones |
| No-match rate | Whether trimming the prompt cost comprehension |
| Escalation rate by reason | Whether a specific path regressed |
| Call duration | A faster bot that takes more turns is not faster |

`analysisPlan.structuredDataPlan` in this build already emits intent, resolution, escalation reason
and no-match count per call, so most of this is available without new instrumentation.

**Where I would stop.** Against the real ~2000ms baseline, Tiers 1 and 2 add up to roughly 250–520ms —
Tier 1's ~150–220ms plus Tier 2's ~100–300ms tool-round-trip removal — which is **~15–25%**, not 40%,
without hurting the conversation. I don't have a clean measured split between tool-bearing and
conversational-only turns in this sample to quote a second number with any confidence, so I'm not
going to invent one. Squeezing further out of `eotThreshold` alone would technically move the number
while making Ava interrupt people — trading a metric the business asked for against the experience the
metric was a proxy for. The honest answer to BrightConnect is that Tiers 1–2 reliably deliver 15–25%
with no quality cost; reaching 40% needs either Tier 3 provider swaps validated by A/B testing, or
accepting a measurable rise in interruption rate — and here is the curve showing what that last stretch
would cost.

Hitting a latency target by making the bot talk over customers is not a win. It is the same failure
in a different metric.
