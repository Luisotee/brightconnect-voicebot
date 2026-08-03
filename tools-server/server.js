'use strict';

/**
 * BrightConnect voicebot — tool webhook server.
 *
 * Receives Vapi `tool-calls` messages and returns tool results. Zero dependencies:
 * run it with `node server.js`, expose it with a Cloudflare Tunnel, point the tools at that URL.
 *
 * Vapi sends:   { message: { type: "tool-calls", toolCallList: [{ id, function: { name, arguments } }] } }
 * Vapi expects: { results: [{ toolCallId, result }] }   (or { toolCallId, error })
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8787);
const SHARED_SECRET = process.env.VAPI_TOOL_SECRET || '';

const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'accounts.json'), 'utf8'));
const planById = new Map(db.plans.map((p) => [p.id, p]));

let ticketSeq = 4470;

// --- helpers ---------------------------------------------------------------

/** Vapi may pass a spoken number in any shape: "(415) 555-0166", "415 555 0166", "+14155550166". */
const normalizePhone = (raw) => String(raw ?? '').replace(/\D/g, '').slice(-10);

const findAccount = (args) => {
  const phone = normalizePhone(args.phoneNumber);
  const accountId = String(args.accountId ?? '').trim().toUpperCase();
  return db.accounts.find(
    (a) => (phone && a.phoneNumber === phone) || (accountId && a.accountId === accountId)
  );
};

/** Money as words-friendly text — the model should never have to format currency itself. */
const money = (amount) => `$${Number(amount).toFixed(2)}`;

const spokenDate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[m - 1]} ${d}, ${y}`;
};

class ToolError extends Error {}

const requireAccount = (args) => {
  if (normalizePhone(args.phoneNumber) === db.faultInjection.phoneNumber) {
    throw new Error('Account system unavailable');   // deliberate 500 for the demo
  }
  const account = findAccount(args);
  if (!account) {
    throw new ToolError(
      'No account found for that number. Ask the customer to confirm it, or offer to look them up another way.'
    );
  }
  return account;
};

// --- tools -----------------------------------------------------------------

/**
 * One call serves every intent: identity, plan, outage, balance and contract state.
 * Deliberately fat so no intent needs a second identification round trip.
 */
const lookupAccount = (args) => {
  const account = requireAccount(args);
  const plan = planById.get(account.planId);

  return {
    found: true,
    accountId: account.accountId,
    firstName: account.firstName,
    plan: { name: plan.name, speedMbps: plan.speedMbps, monthlyPrice: money(plan.monthlyPrice) },
    areaOutage: account.areaOutage?.active
      ? {
          active: true,
          cause: account.areaOutage.cause,
          estimatedFix: account.areaOutage.estimatedFixText,
          reference: account.areaOutage.reference,
        }
      : { active: false },
    balance: {
      amount: money(account.balance.amount),
      dueDate: spokenDate(account.balance.dueDate),
      overdue: account.balance.overdue,
      nothingOwed: account.balance.amount === 0,
    },
    contract: {
      inContract: account.contract.inContract,
      endsOn: spokenDate(account.contract.endsOn),
      earlyTerminationFee: money(account.contract.earlyTerminationFee),
    },
  };
};

/** The genuinely slow one — a real line test takes seconds. Kept separate and fault-path only. */
const runLineDiagnostic = (args) => {
  const account = requireAccount(args);
  const d = account.lineDiagnostic;
  return {
    result: d.result,
    detail: d.detail,
    suspectedCause: d.suspectedCause,
    guidance:
      d.suspectedCause === 'customer_equipment'
        ? 'Line is clean. Ask whether they have already power cycled the router. If they have, this is a hardware fault — escalate.'
        : 'Fault is on our side. Explain the cause and the estimated fix time. Do not ask them to reboot anything.',
  };
};

const sendPaymentLink = (args) => {
  const account = requireAccount(args);
  if (account.balance.amount === 0) {
    return { sent: false, reason: 'Nothing is owed on this account. Tell the customer their balance is clear.' };
  }
  const destination = normalizePhone(args.phoneNumber) || account.phoneNumber;
  return {
    sent: true,
    amount: money(account.balance.amount),
    sentTo: destination.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'),
    channel: 'SMS',
    expiresInHours: 24,
  };
};

const getPlanOptions = (args) => {
  const account = requireAccount(args);
  const current = planById.get(account.planId);
  const others = db.plans.filter((p) => p.id !== current.id);

  return {
    currentPlan: { name: current.name, speedMbps: current.speedMbps, monthlyPrice: money(current.monthlyPrice) },
    options: others.map((p) => ({
      id: p.id,
      name: p.name,
      speedMbps: p.speedMbps,
      monthlyPrice: money(p.monthlyPrice),
      direction: p.monthlyPrice > current.monthlyPrice ? 'upgrade' : 'downgrade',
    })),
    guidance: 'Describe at most two options that match what the customer asked for. Never read the whole list aloud.',
  };
};

const schedulePlanChange = (args) => {
  const account = requireAccount(args);
  const current = planById.get(account.planId);
  const target = planById.get(String(args.newPlanId ?? '').trim());

  if (!target) {
    throw new ToolError('That plan was not recognised. Ask the customer which plan they meant.');
  }

  // Business rule: a downgrade inside contract triggers a fee, which is a human decision.
  const isDowngrade = target.monthlyPrice < current.monthlyPrice;
  if (isDowngrade && account.contract.inContract) {
    return {
      scheduled: false,
      requiresHuman: true,
      reason: `Downgrading while in contract would trigger an early termination fee of ${money(account.contract.earlyTerminationFee)}.`,
      guidance: 'Do not process this. Explain the fee exists, then escalate so a human can go through the options.',
    };
  }

  return {
    scheduled: true,
    newPlan: target.name,
    newMonthlyPrice: money(target.monthlyPrice),
    effectiveFrom: 'the start of the next billing cycle',
    confirmationSentTo: account.phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'),
  };
};

const escalateToHuman = (args) => {
  const account = findAccount(args);   // deliberately tolerant: escalation must work even unidentified
  const ticket = `BC-${++ticketSeq}`;

  console.log(
    `[escalation] ${ticket} reason=${args.reason ?? 'unspecified'} account=${account?.accountId ?? 'unidentified'}\n` +
    `             summary: ${args.summary ?? '(none provided)'}`
  );

  return {
    ticketId: ticket,
    // Spelled for TTS so the customer hears the characters, not a mangled word.
    ticketIdSpoken: ticket.split('').join(' ').replace(/ - /g, ' dash '),
    team: args.reason === 'cancellation' ? 'the account team' : 'our technical team',
    contextPassed: true,
    guidance:
      'Tell the customer the reference, say the next person already has the details so they will not need to repeat themselves, then transfer.',
  };
};

const TOOLS = {
  lookupAccount,
  runLineDiagnostic,
  sendPaymentLink,
  getPlanOptions,
  schedulePlanChange,
  escalateToHuman,
};

// --- request handling ------------------------------------------------------

const runToolCall = ({ id, function: { name, arguments: args } = {} }) => {
  const handler = TOOLS[name];
  if (!handler) return { toolCallId: id, error: `Unknown tool: ${name}` };

  try {
    return { toolCallId: id, result: JSON.stringify(handler(args ?? {})) };
  } catch (err) {
    if (err instanceof ToolError) {
      // Expected, recoverable — hand the model a usable message rather than an exception.
      return { toolCallId: id, result: JSON.stringify({ ok: false, message: err.message }) };
    }
    console.error(`[tool:${name}] ${err.message}`);
    return { toolCallId: id, error: `${name} is unavailable right now.` };
  }
};

const server = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'GET' && req.url === '/health') {
    return send(200, { ok: true, tools: Object.keys(TOOLS) });
  }

  if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });

  if (SHARED_SECRET && req.headers['x-vapi-secret'] !== SHARED_SECRET) {
    return send(401, { error: 'Unauthorized' });
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1e6) req.destroy();   // nothing legitimate is this big
  });

  req.on('end', () => {
    let toolCallList;
    try {
      toolCallList = JSON.parse(raw)?.message?.toolCallList;
    } catch {
      return send(400, { error: 'Invalid JSON' });
    }

    if (!Array.isArray(toolCallList)) {
      return send(400, { error: 'Expected message.toolCallList' });
    }

    send(200, { results: toolCallList.map(runToolCall) });
  });
});

server.listen(PORT, () => {
  if (!SHARED_SECRET) {
    console.warn('WARNING: VAPI_TOOL_SECRET is not set — the endpoint accepts unauthenticated requests.');
  }
  console.log(`BrightConnect tools server listening on :${PORT}`);
});
