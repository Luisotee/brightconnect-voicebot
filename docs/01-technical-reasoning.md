# Technical Reasoning — BrightConnect Voicebot

**Deliverable 2 of 4** · Platform: Vapi.ai · Agent: Ava

---

## 1. Platform selection

**Chose Vapi over Bland.ai and ElevenLabs Agents.**

The deciding factor was that Vapi is orchestration, not a stack. Every layer — transcriber, model,
voice — is an independently swappable block. In this repo all three live in a single file
(`assistant/stack.json`); changing provider is a three-line edit and a redeploy. That matters beyond
tidiness: the answer to the bonus question below is only credible on a platform where you can
actually swap a layer and measure the difference.

Three other things decided it:

- **Config as code.** The whole assistant is version-controlled JSON deployed through the API, not
  clicks in a dashboard. Reviewable, diffable, reproducible.
- **Real tool calling with webhooks.** Custom tools point at an HTTP endpoint. The bot in this
  submission queries an actual backend rather than reciting invented account details from a prompt.
- **One config, two channels.** The same assistant serves telephony and the browser Web SDK, which
  is what made a free, phone-number-less demo possible.

**What the alternatives had going for them, honestly.** Bland's vertically integrated stack removes
exactly the variance Vapi exposes — fewer moving parts, fewer provider-specific failure modes, and a
lower-effort path to a working agent. ElevenLabs Agents has the best voice quality available and the
tightest TTS integration, since it *is* the TTS vendor. Both are defensible choices.

**What choosing Vapi costs.** Provider-agnosticism means provider-shaped problems become mine.
Vapi's own documentation still shows retired model identifiers in code samples (see §3), and its
supported-model list moves faster than its docs. That is the price of the flexibility, and it is
worth paying here specifically because the exercise asks about latency trade-offs — a question you
cannot meaningfully answer on a platform that won't let you change the variables.

---

## 2. LLM provider

**Chose Gemini 3.5 Flash** (`provider: google`), with `temperature: 0.3` and `maxTokens: 250`.

For a four-intent support bot, the selection criteria are not the ones benchmarks measure:

| Criterion | Why it dominates here |
|---|---|
| Time to first token | The model sits in the middle of every turn. Flash-class TTFT is ~0.21–0.37s; a frontier model can cost triple that, and the caller feels every millisecond. |
| Tool-call reliability | Six tools with structured arguments. A model that calls the wrong tool or malforms arguments breaks the call outright — a subtler failure than a clumsy sentence. |
| Instruction adherence | The hard rules (never take card numbers, never process cancellations, never invent balances) are only worth writing if the model actually holds them. |
| Cost per call | Support volume is high and margins are thin. This is a real production constraint, not a footnote. |
| **Deprecation runway** | See below. |

Reasoning depth is deliberately absent from that list. Nothing Ava does requires it, and paying for
it in latency on every turn would be a poor trade.

**On deprecation runway.** The obvious pick was Gemini 2.5 Flash. Google retires the 2.5 family in
**October 2026**, so a bot shipped this quarter would need a model migration inside its first month
of production. Choosing the current Flash generation avoids a migration that buys nothing. Model
lifecycle deserves to sit alongside latency and cost as a selection criterion — a slightly faster
model with six weeks of life left is not the faster choice.

**What would change this decision.** Genuinely multilingual routing, or intents requiring
multi-step reasoning over policy documents, would justify a larger model — most likely as a
two-tier setup, with Flash handling the common path and escalating only ambiguous turns, rather
than upgrading every turn to pay for the rare one.

---

## 3. Speech components

### Speech-to-text — Deepgram Flux (`flux-general-en`), Nova-3 as fallback

The reason is architectural rather than accuracy-based. **Flux performs end-of-turn detection inside
the ASR.** Conventional pipelines detect silence, wait out a timeout, finalise a transcript, and only
then start the model — several stages, each contributing latency, each tunable and therefore each a
way to get it wrong. Flux collapses that into the transcription itself.

Because of that, `assistant.json` deliberately sets **no `smartEndpointingPlan`**. Vapi offers one,
and stacking it on Flux would mean two systems deciding the same question and adding delay to reach
the same answer. The one tuned parameter is `eotThreshold` (0.7 — mid-range; 0.5–0.6 is aggressive,
0.9–1.0 conservative).

> A note on a field that is easy to get wrong: `eotTimeoutMs` is the **maximum** wait before a turn
> end is forced, documented by Vapi in the 2000–10000ms range. It reads like a response-delay knob
> and is not one. Several third-party latency guides recommend setting it in the hundreds of
> milliseconds, which fights the model rather than tuning it.

**Keyterm boosting** covers the vocabulary that actually breaks these calls: `BrightConnect`,
`fiber`, plan names, `router`, `modem`. Generic accuracy is not the problem — domain nouns and digit
strings are, and a misheard account number sends the whole call down the wrong path.

**Nova-3 as automatic fallback** (`transcriber.fallbackPlan`) covers Flux being the newer model.

**Trade-off:** `flux-general-en` is English-only. `flux-general-multi` covers ten languages and would
be the right call for a multilingual deployment, at some cost in specialisation.

### Text-to-speech — ElevenLabs Flash v2.5 (`eleven_flash_v2_5`)

~75ms time-to-first-audio against the best voice library available. Someone whose internet has been
down since last night is not in a neutral mood, and warmth is doing real work on that call — Flash
means it costs nothing in latency.

Two models were rejected, and *why* is the interesting part:

- **Eleven v3** is newer and markedly better sounding — and is not a real-time model. Newer is not
  automatically the answer; it is the wrong tool for a live call.
- **Turbo v2.5** is retired. Worth flagging because Vapi's own documentation still uses
  `eleven_turbo_v2_5` in code samples, so copying from the docs ships a dead model.

**Cartesia Sonic 3.5** is configured as the voice fallback and is the credible alternative. Published
figures put it sub-90ms against ElevenLabs' ~75ms, but those come from different parties measuring
differently, so it is a comparison to run rather than a winner to declare.

---

## 4. Latency strategy

### Original targets

| Stage | Expected | Notes |
|---|---|---|
| End-of-turn detection + final transcript | ~100–200ms | Single stage, because Flux merges them |
| LLM time to first token | ~210–370ms | Gemini Flash class |
| TTS time to first audio | ~75ms | ElevenLabs Flash v2.5 |
| WebRTC transport + jitter buffer | ~100–150ms | |
| **Total, caller stops → Ava starts** | **~500–800ms** | Target p50 ~800ms, p95 under 1.2s |
| Tool turns | **+100–300ms** | Own server, one round trip. Target 1.2–1.8s |

### Measured, from real calls

Pulled from Vapi's own per-call metrics (`GET /call/:id` → `artifact.performanceMetrics`), aggregated
across every call placed during development and testing: **13 calls, 31 conversational turns**, 2026-08-03.

| Stage | Measured average | Notes |
|---|---|---|
| Transcriber (STT) | **640ms** | Deepgram Flux, end-of-turn + final transcript |
| Endpointing | **243ms** | Highly variable turn to turn (0ms–~1s) — depends how cleanly the caller stopped talking |
| Model (LLM) | **652ms** | Gemini Flash class, includes tool-calling turns |
| Voice (TTS) | **196ms** | ElevenLabs Flash v2.5, time to first audio |
| Transport (round trip) | **~70ms** | 20ms in + 50ms out, WebRTC |
| **Full turn, caller stops → Ava starts** | **2188ms avg / 1977ms median / 3330ms p90** | See below — running well above the original target |

**This came in slower than the ~500–800ms target, and it's worth saying plainly rather than burying
it.** Two real factors, not just optimistic planning:

1. **Every one of these test calls exercises at least one tool.** The target table's "tool turns"
   row (+100–300ms) assumed a fast local webhook; in practice a tool turn also means the model has to
   reason *twice* — once to decide to call the tool, again to compose a response from its result — so
   the 652ms model average already reflects that, not a clean single-pass generation.
2. **Endpointing is the noisiest stage in the flow (0ms–~1s).** Test calls were typed/read from a
   script at a workstation, not a phone in a real-world acoustic environment, and duration between the
   caller stopping speaking and the endpointer firing depends heavily on how a given sentence trailed
   off. A larger sample from real (not scripted, developer-run) calls would tighten this considerably.

The individual-stage numbers (STT 640ms, TTS 196ms) are in line with what each provider's own
benchmarks claim; the gap between "target" and "measured" lives almost entirely in the model stage and
in tool-calling overhead, which is exactly where the bonus latency answer
(`docs/03-bonus-latency.md`) focuses its recommendations.

### How the design holds to it

- **One lookup serves every intent.** `lookupAccount` returns identity, plan, outage status, balance
  and contract state in a single response, so no intent needs a second identification round trip.
  The cheapest latency is a request you never make.
- **`runLineDiagnostic` is the only genuinely slow tool** and fires only on the fault path.
- **Every tool speaks first.** Each carries a `request-start` message ("Give me one second") spoken
  the instant the tool fires, covering the webhook round trip. The diagnostic's filler explicitly
  sets a longer expectation: *"This takes a few seconds."*
- **The prompt is byte-stable.** It is injected verbatim from `prompt.md`, never templated per call,
  so provider-side prefix caching engages. Per-call variation silently disables it.
- **`maxTokens: 250`.** Ava is instructed to speak in one or two sentences; the cap enforces it. A
  model that runs long delays the *end* of every turn as well as boring the caller.
- **Barge-in is configured, not defaulted.** `stopSpeakingPlan.numWords: 0` stops on any speech.

---

## 5. Error handling

### Misunderstandings — a three-strike ladder that narrows

Repeating an identical prompt at identical speed is the most-hated behaviour in automated phone
systems: it signals nothing was heard and nothing will change. Each strike changes the question.

1. **Re-ask, simplified.** "Sorry, I didn't catch that. What's the phone number on the account?"
2. **Constrain the format, take the blame.** "Still not getting it — my fault. Can you give me the
   number one digit at a time?" Digit-at-a-time changes the *acoustic shape* of the answer, so it
   genuinely helps the ASR rather than only sounding more patient.
3. **Stop.** Escalate. A third and fourth attempt does not fix a bad line, an accent, or a noisy
   room — it just extends the frustration before an escalation that was always coming.

### Other failure modes

| Failure | Behaviour |
|---|---|
| Tool error | Say the system isn't responding, retry once. On a second failure: *"I'd only be guessing"* → escalate. |
| Silence | "Are you still there?" at 8s, twice, then a warm goodbye and `endCall` — never a dial tone. |
| Caller interrupts | Stop mid-sentence and listen. |
| Out of scope | Redirect once, then escalate. |
| Card number offered aloud | Interrupt, decline, offer the payment link. |

**Call termination is tool-driven, not phrase-matched.** Vapi offers `endCallPhrases`, which hangs up
whenever the assistant utters a listed string. An early version of this config listed *"thanks for
calling BrightConnect"* — which appears verbatim in the greeting, so Ava hung up on herself the
moment she finished saying hello. Every call produced a one-message transcript. The fix was not to
remove the offending phrase but to drop the mechanism: a substring matcher racing the `endCall` tool
is two systems deciding one question, the same anti-pattern rejected in §3 for endpointing.
`silenceTimeoutSeconds` and `maxDurationSeconds` bound the worst case, and `deploy.mjs` now refuses
to deploy a config where an end-call phrase collides with the first message.

### Anti-hallucination

The dangerous failure is not a clumsy sentence — it is a **confident, invented account balance**.
Voice makes fabricated specifics sound authoritative, and there is no URL to check. Three rules:

1. Never state an account detail, balance, date, plan or price that did not come from a tool result.
2. Never confirm an action before the tool returns successfully.
3. Never promise an appointment time, engineer arrival, or refund amount — Ava has no such data.

Rule 3 is under real pressure in the primary flow, where the caller mentions a work call in an hour.
The design resists inventing an ETA to comfort them.

### Escalation

Six triggers: cancellation/refund/dispute · two consecutive no-matches · caller asks for a human ·
caller is angry or distressed · a tool fails twice · request outside the supported intents.

Handoffs are **warm**. `escalateToHuman` opens a ticket and passes a summary, so the bot can say the
next person already has the details — addressing the single most common complaint about transfers.
Escalation deliberately works even when identification failed; an escalation path that depends on a
successful lookup breaks exactly when it is needed most.

**Cancellation is trigger one by policy, not by capability.** Ava could process a cancellation; she
is instructed not to. A cancellation call is a retention conversation and often the last chance to
learn why a customer is leaving — handing that to a bot discards the most valuable thirty seconds in
the support operation. "The bot can't" and "the bot must not" look identical from outside and are
entirely different decisions.

### Closing the loop

`analysisPlan.structuredDataPlan` extracts intent, resolution, escalation reason, tools used,
sentiment and no-match count from every call. Without it there is no answer to *what fraction of
calls did this actually resolve* — which is the only number that says whether any of the above works.
