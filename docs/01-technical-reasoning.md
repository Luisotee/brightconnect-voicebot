# Technical Reasoning — BrightConnect Voicebot

**Deliverable 2 of 4** · Platform: Vapi.ai · Agent: Ava

## 1. Platform selection

Chose **Vapi** over Bland.ai and ElevenLabs Agents because it's orchestration, not a fixed stack —
transcriber, model and voice are each independently swappable (`assistant/stack.json`), the whole
assistant is version-controlled config deployed via API rather than dashboard clicks, and tools are
real webhook calls into a live backend rather than a prompt reciting invented data. One config serves
both telephony and the browser demo.

Bland's vertically integrated stack is lower-effort with fewer moving parts; ElevenLabs Agents has the
best voice quality since it *is* the TTS vendor — both are defensible picks. The cost of choosing Vapi
is that provider-shaped problems (e.g. retired model IDs still in Vapi's own docs) become mine to
catch — worth it here specifically because the bonus question requires actually swapping a provider
and measuring the difference.

## 2. LLM provider

**Gemini 3.5 Flash** (`temperature 0.3`, `maxTokens 250`). For a four-intent support bot, what matters
is time-to-first-token (Flash-class ~0.21–0.37s vs. roughly 3x that for a frontier model), tool-call
reliability across six structured tools, instruction adherence (rules like "never invent a balance"
only help if the model actually holds them), and cost per call — not reasoning depth, which nothing
here requires.

Gemini vs. GPT-4/Claude comes down to the same criteria at their comparable Flash/Haiku/mini tiers;
the deciding factor was Google retiring the 2.5 family in October 2026 — shipping the outgoing
generation now would force a migration inside the bot's first month in production.

Would reconsider for genuinely multilingual routing or multi-step policy reasoning — most likely a
two-tier setup (Flash on the common path, escalating only ambiguous turns to a larger model) rather
than upgrading every turn to pay for the rare one.

## 3. Speech components

**STT — Deepgram Flux** (`flux-general-en`, Nova-3 fallback). Flux does end-of-turn detection *inside*
the ASR, collapsing silence-detection, timeout and finalize into one stage — so `assistant.json`
deliberately has no separate `smartEndpointingPlan`; stacking a second system to decide the same
question only adds latency. Keyterm boosting covers the domain nouns that actually break calls
(`BrightConnect`, `fiber`, plan names). Trade-off: English-only — `flux-general-multi` is the path for
a multilingual deployment.

**TTS — ElevenLabs Flash v2.5**, ~75ms to first audio. Eleven v3 sounds better but isn't real-time;
Turbo v2.5 is retired despite still appearing in Vapi's own sample code. Cartesia Sonic 3.5 is
configured as fallback and the credible alternative — worth an A/B on real traffic, not a win to
assume from someone else's benchmark.

## 4. Latency strategy

Target: ~500–800ms caller-stops-talking → Ava-starts (p50), +100–300ms on a tool turn. **Measured**,
from 13 real Vapi calls / 31 turns: average **2188ms**, median **1977ms** — above target, because
every real call fires a tool almost immediately (the model reasons twice: decide to call it, then
compose from the result) and endpointing was noisy on scripted workstation calls rather than a real
phone line. Reported honestly rather than left at the optimistic target.

What holds latency down regardless: one `lookupAccount` call serves every intent, so no repeat
identification round trip; every tool speaks a filler ("give me one second") the instant it fires,
covering the wait; the prompt is byte-stable so provider-side prefix caching stays engaged;
`maxTokens: 250` caps response length as well as time-to-first-token.

## 5. Error handling

**Misunderstandings** — a three-strike ladder that narrows instead of repeating: re-ask simplified →
constrain to digit-at-a-time (genuinely helps the ASR, not just sounds more patient) → escalate.
Repeating an identical prompt is the most-hated behavior in phone systems.

**Escalates on:** cancellation/refund/dispute, two consecutive no-matches, the caller asking for a
human, anger or distress, a tool failing twice, or a request outside the four supported intents.
Handoffs are warm — `escalateToHuman` passes a summary, so the caller never repeats themselves.

**Anti-hallucination:** never state an account detail that didn't come from a tool result, never
confirm an action before the tool succeeds, never invent an appointment time or refund amount. Voice
makes a fabricated specific sound authoritative, and there's no URL for the caller to check it
against.

**Cancellation escalates by policy, not capability** — Ava could process one; a cancellation call is
often the last chance to learn why a customer is leaving, and handing that to a bot gives up the most
valuable thirty seconds in the whole support operation.
