#!/usr/bin/env node
/**
 * Composes the BrightConnect assistant from its parts and deploys it to Vapi.
 *
 *   node assistant/deploy.mjs --dry-run   # print the composed config, touch nothing
 *   node assistant/deploy.mjs             # create, or update if VAPI_ASSISTANT_ID is set
 *   node assistant/deploy.mjs --verify    # fetch the live config back from Vapi
 *
 * Sources, merged in this order:
 *   assistant.json  behaviour, plans, guardrails, analysis
 *   stack.json      model / transcriber / voice   <- swap providers here only
 *   tools.json      function tools                 <- {{ENV}} substituted
 *   prompt.md       system prompt, injected verbatim
 *
 * Zero dependencies. Node 18+.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const API = 'https://api.vapi.ai/assistant';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const VERIFY = args.has('--verify');

// --- env -------------------------------------------------------------------

/** Minimal .env reader — avoids a dependency for six variables. */
const loadEnv = () => {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    process.env[match[1]] ??= value;
  }
};

loadEnv();

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

// --- compose ---------------------------------------------------------------

const readJson = (name) => JSON.parse(readFileSync(join(HERE, name), 'utf8'));

/** Strip _comment and other _-prefixed annotation keys — Vapi rejects unknown fields. */
const stripAnnotations = (value) => {
  if (Array.isArray(value)) return value.map(stripAnnotations);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => [k, stripAnnotations(v)])
    );
  }
  return value;
};

/** Replace {{VAR}} with process.env.VAR, failing loudly rather than deploying a literal placeholder. */
const substituteEnv = (value) => {
  if (typeof value === 'string') {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, name) => {
      if (!process.env[name]) die(`${name} is referenced in the config but not set in .env`);
      return process.env[name];
    });
  }
  if (Array.isArray(value)) return value.map(substituteEnv);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteEnv(v)]));
  }
  return value;
};

const build = () => {
  const base = stripAnnotations(readJson('assistant.json'));
  const stack = stripAnnotations(readJson('stack.json'));
  const tools = substituteEnv(stripAnnotations(readJson('tools.json')).tools);
  const prompt = readFileSync(join(HERE, 'prompt.md'), 'utf8').trim();

  // transferCall is only wired up when a destination exists. Without it the escalation still
  // works end to end — ticket, summary, spoken handoff — it just does not dial out.
  const transferTo = process.env.TRANSFER_DESTINATION_NUMBER;
  if (transferTo) {
    tools.push({
      type: 'transferCall',
      destinations: [
        {
          type: 'number',
          number: transferTo,
          message: 'Connecting you now — one moment.',
        },
      ],
    });
  }

  // An endCallPhrase that appears in firstMessage makes the assistant hang up on its own
  // greeting. The only symptom is a one-message call log, which is a miserable thing to
  // discover during a live demo — so fail here instead.
  const greeting = (base.firstMessage ?? '').toLowerCase();
  for (const phrase of base.endCallPhrases ?? []) {
    if (greeting.includes(phrase.toLowerCase())) {
      die(`endCallPhrases contains "${phrase}", which appears in firstMessage.\n  The assistant would end the call as soon as it finished greeting the caller.`);
    }
  }

  return {
    ...base,
    ...stack,
    model: {
      ...stack.model,
      // The system prompt must be byte-stable across deploys for provider-side prefix
      // caching to engage. Injected verbatim from prompt.md, never templated per call.
      messages: [{ role: 'system', content: prompt }],
      tools,
    },
  };
};

// --- api -------------------------------------------------------------------

const apiKey = process.env.VAPI_API_KEY;
const assistantId = process.env.VAPI_ASSISTANT_ID;

const request = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
  });

  const text = await res.text();
  if (!res.ok) {
    // Vapi's validation errors name the offending field and list valid values — show them whole.
    die(`Vapi returned ${res.status}\n\n${text}`);
  }
  return JSON.parse(text);
};

// --- run -------------------------------------------------------------------

if (DRY_RUN) {
  const config = build();
  console.log(JSON.stringify(config, null, 2));
  console.error(
    `\n✓ Composed successfully — ${config.model.tools.length} tools, ` +
      `${config.model.messages[0].content.length} chars of prompt. Nothing was deployed.\n`
  );
  process.exit(0);
}

if (!apiKey) die('VAPI_API_KEY is not set. Copy .env.example to .env and fill it in.');

if (VERIFY) {
  if (!assistantId) die('VAPI_ASSISTANT_ID is not set — nothing to verify.');
  const live = await request('GET', `${API}/${assistantId}`);
  console.log(JSON.stringify(live, null, 2));
  process.exit(0);
}

const config = build();

const result = assistantId
  ? await request('PATCH', `${API}/${assistantId}`, config)
  : await request('POST', API, config);

console.log(`\n✓ Assistant ${assistantId ? 'updated' : 'created'}: ${result.id}`);
console.log(`  model:       ${result.model?.provider} / ${result.model?.model}`);
console.log(`  transcriber: ${result.transcriber?.provider} / ${result.transcriber?.model}`);
console.log(`  voice:       ${result.voice?.provider} / ${result.voice?.voiceId}`);
console.log(`  tools:       ${result.model?.tools?.map((t) => t.function?.name ?? t.type).join(', ')}`);

if (!assistantId) {
  console.log(`\n  Add this to .env so future deploys update in place:`);
  console.log(`  VAPI_ASSISTANT_ID=${result.id}\n`);
}
