# Demo Video — Beat Sheet

Target: **2–3 minutes**. Two calls: one the bot resolves, one it correctly refuses to.

Record the browser at `web-demo/index.html` — the live transcript and the purple `→ calling …` lines
let a reviewer *see* the function calls, which is the difference between a demo and a claim.

**Before recording:** run one throwaway call. It warms provider connections, confirms the mic level,
and means the first call the reviewer sees is not the one where you discover the tunnel is down.

---

## 0:00–0:12 · Frame it

Screen: the demo page.

> "This is BrightConnect's support voicebot, built on Vapi. I'll make two calls — one it handles on
> its own, one where the right answer is to get a human involved. The transcript on screen shows the
> tools it's calling against a live backend."

Keep it to two sentences. The calls are the deliverable.

---

## 0:12–1:20 · Call 1 — internet fault, ends in escalation

Use **415-555-0166**. This is the primary flow from `02-conversation-flow.md`.

| Beat | You say | Watch for |
|---|---|---|
| Ava greets | — | Time-to-greeting after clicking |
| State the problem | *"My internet's not working. It's been out since last night and I've got a work call in an hour."* | Ava acknowledges the **stake**, not just the fault |
| Give the number | *"Yeah, it's four one five, five five five, oh one double six."* | Say "double six" naturally — the read-back is the point |
| Ava reads back & checks | — | `→ calling lookupAccount`, then `runLineDiagnostic`. Filler covers the wait |
| Ava reports & asks | — | She explains the finding **before** asking you to reboot |
| Refuse the reboot | *"Yeah, I've done that twice. Three times, actually. Nothing."* | **The escalation trigger** |
| Ava escalates | — | `→ calling escalateToHuman`, ticket ID spoken, no invented ETA |

**The moment that sells this call** is Ava *not* promising an engineer before the work call. Let it
play — don't talk over it.

If you want the interruption shown: cut her off mid-sentence once, early. She should stop instantly.

---

## 1:20–2:05 · Call 2 — billing, fully contained

Use **415-555-0166** again (that account has $42.60 due August 14).

| Beat | You say | Watch for |
|---|---|---|
| Ava greets | — | |
| State the intent | *"I need to pay my bill."* | |
| Give the number | *"Four one five, five five five, oh one double six."* | One `lookupAccount` call serves this intent too |
| Ava states balance | — | Amount and date spoken naturally, then the link offer |
| **Try to pay by card** | *"Can I just give you my card number? It's four five three two—"* | **Ava should interrupt and decline.** |
| Accept the link | *"Okay, yeah, text me the link."* | `→ calling sendPaymentLink`; she confirms what, where, how long |

**Say the card line.** It is the strongest thirty seconds in the whole demo: an unprompted security
behaviour a reviewer did not ask for and will not have seen from other candidates.

---

## 2:05–2:30 · Close

Screen: `assistant/stack.json`, then `docs/`.

> "The whole assistant is version-controlled config — the three provider blocks are isolated in one
> file, so swapping the transcriber, model or voice is a three-line change. The reasoning behind each
> choice, the conversation design, and the latency answer are in the repo."

---

## Optional 20s — tool-failure recovery

If you have room, a third short call to **415-555-0100** forces a backend failure. Ava retries once,
then says she'd *"only be guessing"* and escalates rather than inventing a balance.

Worth including if the video is running short. Cut it before going over three minutes — the brief
says 2–3 and respecting the brief is itself being assessed.

---

## Checklist

- [ ] Warm-up call done, mic level checked, tunnel confirmed with `curl …/health`
- [ ] Escalation actually transferred or closed cleanly — **verified before recording, not during**
- [ ] Tool-call lines visible in the transcript
- [ ] Card-refusal moment captured
- [ ] Under 3:00
- [ ] Watched back once with sound
