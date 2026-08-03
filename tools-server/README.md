# Tools server

Webhook backend for the BrightConnect voicebot. Zero dependencies — Node 18+ only, no `npm install`.

Fixture data, not a real system. It exists to prove the bot does real function calling rather than
inventing account details in the prompt.

## Run

```bash
export VAPI_TOOL_SECRET="$(openssl rand -hex 16)"   # keep this, the assistant config needs it
node server.js                                       # listens on :8787
```

## Test

```bash
node test/run-tests.js                               # local
BASE_URL=https://tools.yourdomain.com node test/run-tests.js   # through the tunnel
```

Covers all six tools plus the three paths that matter most: unknown account, in-contract downgrade,
and a forced backend failure. Every assertion checks the Vapi contract — each result echoes its
`toolCallId` and carries either `result` or `error`.

The `test/sample-payloads/*.json` files are the same payloads in Vapi's real request shape, for
manual `curl` checks:

```bash
curl -s localhost:8787 -H 'content-type: application/json' \
  -H "x-vapi-secret: $VAPI_TOOL_SECRET" \
  -d @test/sample-payloads/lookup-account.json | jq
```

## Expose via Cloudflare Tunnel

```bash
cloudflared tunnel create brightconnect-tools
cloudflared tunnel route dns brightconnect-tools tools.yourdomain.com
cloudflared tunnel run --url http://localhost:8787 brightconnect-tools
```

Confirm it is actually reachable from outside before deploying the assistant — a tunnel that resolves
locally but not publicly produces tool timeouts that look like model failures:

```bash
curl -s https://tools.yourdomain.com/health | jq
```

Then set `TOOLS_BASE_URL=https://tools.yourdomain.com` in `.env` and deploy the assistant.

## Auth

Every tool sends `x-vapi-secret`, configured in `assistant/tools.json` under each tool's `server.headers`.
The server rejects mismatches with a 401. If `VAPI_TOOL_SECRET` is unset the server logs a warning and
accepts anything — fine locally, not fine on a public tunnel.

## Tools

| Tool | Purpose | Notes |
|---|---|---|
| `lookupAccount` | Identity, plan, area outage, balance, contract — in one response | Deliberately fat, so no intent needs a second identification round trip |
| `runLineDiagnostic` | Deep line test | The genuinely slow one. Fault path only |
| `sendPaymentLink` | SMS a secure payment link | Refuses when nothing is owed. Card details never enter the voice channel |
| `getPlanOptions` | Plans other than the current one | Returns guidance telling the model not to read the whole list aloud |
| `schedulePlanChange` | Apply a plan change | Returns `requiresHuman` on an in-contract downgrade rather than processing it |
| `escalateToHuman` | Open a ticket, pass a summary | Works even when the caller was never identified — escalation must never depend on a successful lookup |

Tool results carry a `guidance` field where behaviour depends on the outcome. Keeping that branch in
the tool response rather than the system prompt keeps the prompt short and byte-stable, which matters
for both time-to-first-token and prefix caching.

## Demo fixtures

| Number | Customer | Scenario |
|---|---|---|
| `415-555-0166` | Sarah Mitchell | No outage, line clean → router fault → **escalation path** |
| `415-555-0182` | David Okafor | Active area outage with an ETA → **resolved, no escalation** |
| `415-555-0193` | Maria Santos | Overdue balance, in contract → upgrade automated, downgrade escalates |
| `415-555-0100` | — | Forces a backend failure, for demonstrating tool-failure recovery |
