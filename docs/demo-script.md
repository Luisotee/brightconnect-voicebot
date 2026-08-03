# Demo Video — Beat Sheet

The brief asks for one thing: *"a demo video (2–3 min) showing the bot handling a typical call."*
One call, fully resolved, no escalation — this comes in well under the time cap.

Record the live site — [dev3000.luisotee.com](https://dev3000.luisotee.com/) — or `pnpm dev` in
`web/` if recording locally. The transcript and tool-call chips let a reviewer *see* the function
call, not just hear a voice.

**Before recording:** run one throwaway call. It warms provider connections and confirms the mic
level, so the first call the reviewer sees isn't the one where you discover a problem live.

---

## Use 415-555-0182 — David Okafor, known area outage

This account is the cleanest "typical call": one `lookupAccount` call, no branching, no escalation,
fully resolved by the bot. Scenario source: `tools-server/data/accounts.json`.

## 0:00–0:10 · Frame it

Screen: the demo page.

> "This is BrightConnect's support voicebot, built on Vapi. I'll report an outage and show it
> resolving the call on its own, live against a real backend."

## 0:10–0:50 · The call

| Beat | You say | Watch for |
|---|---|---|
| Ava greets | — | Time-to-greeting after clicking |
| State the problem | *"Hi, my internet isn't working."* | Open capture, no menu |
| Ava asks for the number | — | "Can I take the phone number on your account?" |
| Give the number | *"Four one five, five five five, oh one eight two."* | Natural digit grouping |
| Ava reads back & checks | — | `→ calling lookupAccount`. One tool call resolves this — no line diagnostic needed once an area outage is found |
| Ava reports & resolves | — | She states the cause (fiber cut during roadworks) and the ETA (today, about six in the evening) — **no reboot request, no escalation, nothing invented** |

**The moment that sells this call** is that Ava never asks you to do anything — she diagnoses the
cause herself and gives an honest, sourced ETA. Let it play; don't talk over it.

## 0:50–1:10 · Close

Screen: `assistant/stack.json`, then `docs/`.

> "The whole assistant is version-controlled config — the three provider blocks are isolated in one
> file, so swapping the transcriber, model or voice is a three-line change. The reasoning behind each
> choice, the conversation design, and the latency answer are in the repo."

---

## If you want to show more

The bot also handles billing, plan changes, and knows when to escalate (a hardware fault, a
cancellation, a tool failure) — see `docs/02-conversation-flow.md` for the annotated escalation flow,
or try `415-555-0166` (router fault → escalation), `415-555-0193` (billing/plan changes), or
`415-555-0100` (forced backend failure → recovery) live on the demo page yourself. None of this is
required for the video — the brief asks for one typical call, not a tour.

## Checklist

- [ ] Warm-up call done, mic level checked
- [ ] Tool-call line (`lookupAccount`) visible in the transcript
- [ ] Outage cause and ETA both spoken, nothing invented
- [ ] Under 2:00
- [ ] Watched back once with sound
