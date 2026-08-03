'use strict';

/**
 * Exercises every tool against a running server and checks the Vapi contract:
 * each result must echo its toolCallId and carry either `result` or `error`.
 *
 *   node test/run-tests.js                        # against http://localhost:8787
 *   BASE_URL=https://tools.example.com node ...   # against the tunnel
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const SECRET = process.env.VAPI_TOOL_SECRET || '';

const call = (id, name, args) => ({
  message: { type: 'tool-calls', toolCallList: [{ id, name, arguments: args }] },
});

const CASES = [
  {
    label: 'lookupAccount — spoken-format number resolves',
    payload: call('t1', 'lookupAccount', { phoneNumber: '(415) 555-0166' }),
    expect: (r) => r.found === true && r.firstName === 'Sarah' && r.areaOutage.active === false,
  },
  {
    label: 'lookupAccount — known area outage is reported',
    payload: call('t2', 'lookupAccount', { phoneNumber: '415 555 0182' }),
    expect: (r) => r.areaOutage.active === true && typeof r.areaOutage.estimatedFix === 'string',
  },
  {
    label: 'lookupAccount — unknown number returns a usable message, not a crash',
    payload: call('t3', 'lookupAccount', { phoneNumber: '4155559999' }),
    expect: (r) => r.ok === false && typeof r.message === 'string',
  },
  {
    label: 'runLineDiagnostic — clean line points at customer equipment',
    payload: call('t4', 'runLineDiagnostic', { accountId: 'BC-100482' }),
    expect: (r) => r.result === 'healthy' && r.suspectedCause === 'customer_equipment',
  },
  {
    label: 'sendPaymentLink — sends and reports expiry',
    payload: call('t5', 'sendPaymentLink', { phoneNumber: '4155550166' }),
    expect: (r) => r.sent === true && r.amount === '$42.60' && r.expiresInHours === 24,
  },
  {
    label: 'sendPaymentLink — refuses when nothing is owed',
    payload: call('t6', 'sendPaymentLink', { phoneNumber: '4155550182' }),
    expect: (r) => r.sent === false,
  },
  {
    label: 'getPlanOptions — excludes the current plan',
    payload: call('t7', 'getPlanOptions', { accountId: 'BC-100482' }),
    expect: (r) => r.options.length === 2 && !r.options.some((p) => p.id === 'fiber-500'),
  },
  {
    label: 'schedulePlanChange — upgrade is automated',
    payload: call('t8', 'schedulePlanChange', { accountId: 'BC-100482', newPlanId: 'fiber-1gig' }),
    expect: (r) => r.scheduled === true && r.newMonthlyPrice === '$75.00',
  },
  {
    label: 'schedulePlanChange — in-contract downgrade escalates instead',
    payload: call('t9', 'schedulePlanChange', { accountId: 'BC-100482', newPlanId: 'essential-100' }),
    expect: (r) => r.scheduled === false && r.requiresHuman === true,
  },
  {
    label: 'escalateToHuman — works even when the caller was never identified',
    payload: call('t10', 'escalateToHuman', { reason: 'asr_failure', summary: 'Could not hear the caller.' }),
    expect: (r) => typeof r.ticketId === 'string' && r.contextPassed === true,
  },
  {
    label: 'fault injection — surfaces as an error field, not a hang',
    payload: call('t11', 'lookupAccount', { phoneNumber: '4155550100' }),
    expectError: true,
  },
];

const post = async (payload) => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(SECRET && { 'x-vapi-secret': SECRET }) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

(async () => {
  console.log(`Testing ${BASE_URL}\n`);

  const health = await fetch(`${BASE_URL}/health`).then((r) => r.json());
  console.log(`  health: ${health.tools.length} tools registered\n`);

  let failed = 0;

  for (const { label, payload, expect, expectError } of CASES) {
    const sentId = payload.message.toolCallList[0].id;
    try {
      const { results } = await post(payload);
      const [entry] = results;

      if (entry.toolCallId !== sentId) throw new Error(`toolCallId mismatch: got ${entry.toolCallId}`);

      if (expectError) {
        if (!entry.error) throw new Error('expected an error field');
      } else {
        if (entry.error) throw new Error(`unexpected error: ${entry.error}`);
        if (!expect(JSON.parse(entry.result))) throw new Error(`assertion failed: ${entry.result}`);
      }

      console.log(`  PASS  ${label}`);
    } catch (err) {
      console.log(`  FAIL  ${label}\n        ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
  process.exit(failed ? 1 : 0);
})();
