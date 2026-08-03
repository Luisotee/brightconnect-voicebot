# BrightConnect Customer Support Voicebot

Submission for the **AI Conversational Designer — Voicebots** hiring exercise, International
Application Group.

A customer support voicebot for BrightConnect, an internet and mobile provider. Built on **Vapi.ai**,
handling internet faults, bill payment and plan changes autonomously, and escalating cancellations,
disputes and unresolved faults to a human.

---

## The four deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | **Bot demo** | Live page + recorded video *(links below)* |
| 2 | **Technical reasoning** | [`docs/01-technical-reasoning.md`](docs/01-technical-reasoning.md) |
| 3 | **Conversation flow** | [`docs/02-conversation-flow.md`](docs/02-conversation-flow.md) |
| 4 | **Bonus — 40% latency** | [`docs/03-bonus-latency.md`](docs/03-bonus-latency.md) |

> **Demo video:** _add link_
> **Live demo:** _add link_ — talk to the bot in your browser, no phone call needed

---

## What it does

| Intent | Handled | How |
|---|---|---|
| "My internet is not working" | **Autonomously** | Checks for an area outage, runs a line diagnostic, guides a fix. Escalates on hardware faults |
| "I want to pay my bill" | **Autonomously** | States the balance, texts a secure payment link. **Never takes card details by voice** |
| "I need to change my plan" | **Autonomously** | Upgrades and like-for-like changes. Escalates anything triggering an early termination fee |
| "I want to cancel my subscription" | **Always escalates** | By policy, not by limitation — see below |

**Cancellation is a deliberate escalation.** Ava is fully capable of processing one; she is instructed
not to. A cancellation call is a retention conversation and often the last chance to learn why a
customer is leaving. "The bot can't" and "the bot must not" look identical from outside and are
completely different design decisions.

## The stack

| Layer | Choice | One-line reason |
|---|---|---|
| Platform | **Vapi.ai** | Provider-agnostic orchestration; config as code; real webhook tools |
| STT | **Deepgram Flux**, Nova-3 fallback | End-of-turn detection built into the ASR removes a whole pipeline stage |
| LLM | **Gemini 3.5 Flash** | Low TTFT, reliable tool calling — and 2.5 retires in October 2026 |
| TTS | **ElevenLabs Flash v2.5** | ~75ms to first audio without giving up warmth |

All three live in [`assistant/stack.json`](assistant/stack.json). Swapping any layer is a three-line
edit and a redeploy — nothing else in the repo changes.

Full reasoning, trade-offs and rejected alternatives: [`docs/01-technical-reasoning.md`](docs/01-technical-reasoning.md).

---

## Layout

```
assistant/      Vapi config as code
  prompt.md       system prompt — the conversational design work
  stack.json      model / transcriber / voice, isolated for swapping
  assistant.json  behaviour, endpointing, guardrails, call analysis
  tools.json      six function tools, each with a request-start filler
  deploy.mjs      merges the above and deploys via the Vapi API
tools-server/   Node webhook backend, zero dependencies, fixture data
web/            Next.js browser demo using the Vapi Web SDK (pnpm, Tailwind, shadcn/ui)
docs/           the three written deliverables + demo beat sheet
```

## Running it

**1. Configure**

```bash
cp .env.example .env      # fill in VAPI_API_KEY, VAPI_PUBLIC_KEY, TOOLS_BASE_URL, VAPI_TOOL_SECRET
```

**2. Start the tools backend and expose it**

```bash
export VAPI_TOOL_SECRET="…"
node tools-server/server.js                                    # :8787
cloudflared tunnel run --url http://localhost:8787 brightconnect-tools
curl -s https://tools.yourdomain.com/health                    # confirm publicly reachable
```

**3. Check the config composes, then deploy**

```bash
node assistant/deploy.mjs --dry-run    # prints the merged config, deploys nothing
node assistant/deploy.mjs              # creates the assistant, prints its id
node assistant/deploy.mjs --verify     # reads the live config back from Vapi
```

Put the returned id in `.env` as `VAPI_ASSISTANT_ID`; later deploys then update in place.

**4. Test**

```bash
node tools-server/test/run-tests.js                            # 11 checks, all six tools
BASE_URL=https://tools.yourdomain.com node tools-server/test/run-tests.js
```

**5. Demo**

```bash
cd web
cp .env.example .env      # fill in NEXT_PUBLIC_VAPI_PUBLIC_KEY, NEXT_PUBLIC_VAPI_ASSISTANT_ID
pnpm install
pnpm dev                                    # local, or `pnpm build && pnpm start` to serve it
```

`?key=…&assistant=…` in the URL overrides the env vars at runtime, for testing without a redeploy.

Details: [`tools-server/README.md`](tools-server/README.md) · [`docs/demo-script.md`](docs/demo-script.md)

---

## Try these numbers

| Number | Scenario |
|---|---|
| `415-555-0166` | No outage, line tests clean → router fault → **escalation** |
| `415-555-0182` | Known area outage with an ETA → **resolved, no human needed** |
| `415-555-0193` | Overdue balance, in contract → upgrade automated, downgrade escalates |
| `415-555-0100` | Forces a backend failure → **tool-failure recovery** |

Also worth trying: start reading out a card number. Ava will stop you and offer the payment link
instead — card data never enters the voice channel, which keeps the call recording, the transcript
and three providers' logs out of PCI-DSS scope.

---

## Notes on what is real and what is not

- The tool backend is **real** — live HTTPS endpoints, shared-secret auth, real function calling. The
  **data behind it is fixtures.** The bot queries a backend rather than inventing account details in
  a prompt, which is the part that matters.
- Latency figures in the reasoning doc are **targets, not measurements**, and labelled as such.
  Estimates presented as measurements are worse than no numbers.
- `transferCall` is wired only when `TRANSFER_DESTINATION_NUMBER` is set. Without it, escalation still
  runs end to end — ticket, summary, spoken handoff — it just does not dial out. Phone-number
  transfer destinations are not expected to work on browser web calls.
