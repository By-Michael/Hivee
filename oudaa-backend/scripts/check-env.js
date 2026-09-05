#!/usr/bin/env node
// -----------------------------------------------------------------------
// check-env.js — pings every external service the backend depends on
// with the credentials currently in your .env, and prints a clear
// PASS/FAIL/SKIP per service. Doesn't touch your database schema or send
// real payments/emails; read-only or harmless test calls only.
//
// Usage:
//   node scripts/check-env.js
//   npm run check-env        (after adding the script below to package.json)
// -----------------------------------------------------------------------

require('dotenv').config();

const results = [];

function log(name, status, detail) {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'SKIP' ? '⚪' : '❌';
  console.log(`${icon} ${name.padEnd(28)} ${status.padEnd(5)} ${detail || ''}`);
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---- 1. Database ----
async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    return log('DATABASE_URL', 'FAIL', 'not set');
  }
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await withTimeout(prisma.$queryRaw`SELECT 1`, 5000, 'db');
    await prisma.$disconnect();
    log('DATABASE_URL', 'PASS', 'connected');
  } catch (err) {
    log('DATABASE_URL', 'FAIL', err.message.split('\n')[0]);
  }
}

// ---- 2. JWT secrets (sanity only — no external call) ----
function checkJwtSecrets() {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const val = process.env[key];
    if (!val) return log(key, 'FAIL', 'not set');
    if (val.length < 16) return log(key, 'FAIL', 'set but suspiciously short — use a long random value');
    log(key, 'PASS', 'set');
  }
}

// ---- 3. Veritas (bank verification) ----
async function checkVeritas() {
  const apiKey = process.env.VERITAS_API_KEY;
  const apiUrl = process.env.VERITAS_API_URL || 'https://verifyapi.leulzenebe.pro';
  if (!apiKey) {
    return log('VERITAS_API_KEY', 'SKIP', 'not set — bank verification runs in STUB mode');
  }
  try {
    // Deliberately-bogus reference: we only care whether the API accepts
    // our key and responds sanely, not whether a match is found.
    const res = await withTimeout(
      fetch(`${apiUrl}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ reference: 'CHECKENV000TEST' }),
      }),
      8000,
      'veritas'
    );
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { /* non-JSON body, handled below */ }

    if (res.status === 401 || res.status === 403) {
      return log('VERITAS_API_KEY', 'FAIL', `auth rejected (${res.status}) — key is invalid/expired`);
    }
    if (res.status === 404 || res.status === 405) {
      return log('VERITAS_API_KEY', 'FAIL', `${res.status} at ${apiUrl}/verify — endpoint path mismatch, check VERITAS_API_URL (this custom fork may use a different route)`);
    }
    if (res.status >= 500) {
      return log('VERITAS_API_KEY', 'FAIL', `Veritas service error (${res.status}): ${text.slice(0, 150)}`);
    }
    // 200 with "no transaction found", or a 4xx validation error for our
    // fake reference, both mean the key itself is accepted.
    log('VERITAS_API_KEY', 'PASS', `key accepted (HTTP ${res.status}, ${apiUrl})`);
  } catch (err) {
    log('VERITAS_API_KEY', 'FAIL', `network error: ${err.message}${err.cause ? ` — cause: ${err.cause.code || err.cause.message || err.cause}` : ''}`);
  }
}

// ---- 4. OCR.space ----
async function checkOcrSpace() {
  const apiKey = process.env.OCRSPACE_API_KEY;
  if (!apiKey) {
    return log('OCRSPACE_API_KEY', 'SKIP', 'not set');
  }
  try {
    // 1x1 transparent PNG, base64 — smallest possible real image OCR.space
    // will accept, just to validate the key/quota rather than produce a
    // useful OCR result.
    const tinyPngB64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const form = new FormData();
    form.append('apikey', apiKey);
    form.append('base64Image', `data:image/png;base64,${tinyPngB64}`);
    form.append('language', 'eng');

    const res = await withTimeout(
      fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form }),
      15000,
      'ocrspace'
    );
    if (res.status === 403) {
      return log('OCRSPACE_API_KEY', 'FAIL', 'auth rejected (403) — key is invalid');
    }
    if (res.status === 503) {
      const body = await res.text();
      return log('OCRSPACE_API_KEY', 'FAIL', `throttled/overloaded (503): ${body.slice(0, 120)}`);
    }
    if (!res.ok) {
      const body = await res.text();
      return log('OCRSPACE_API_KEY', 'FAIL', `HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
    const data = await res.json();
    if (data.IsErroredOnProcessing) {
      const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join('; ') : data.ErrorMessage;
      // A 1x1 blank image legitimately has no text — "no text detected"-type
      // errors here still mean the KEY works. Only flag quota/auth errors.
      if (/rate|throttl|overload|invalid.*key|quota/i.test(msg || '')) {
        return log('OCRSPACE_API_KEY', 'FAIL', msg);
      }
      return log('OCRSPACE_API_KEY', 'PASS', `key works (processing note: ${msg})`);
    }
    log('OCRSPACE_API_KEY', 'PASS', 'key accepted');
  } catch (err) {
    log('OCRSPACE_API_KEY', 'FAIL', `network error: ${err.message}${err.cause ? ` — cause: ${err.cause.code || err.cause.message || err.cause}` : ''}`);
  }
}

// Mirrors the retirement-guard in src/utils/groqReceiptParser.js — if that
// list changes, update it here too so this script tests what the app
// actually calls, not a stale env var the app already routes around.
const RETIRED_GROQ_MODELS = new Set([
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'moonshotai/kimi-k2-instruct',
  'moonshotai/kimi-k2-instruct-0905',
  'gemma2-9b-it',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma-7b-it',
  'llama-3.2-1b-preview',
]);

function resolveGroqModel(envValue, fallback) {
  if (envValue && RETIRED_GROQ_MODELS.has(envValue)) {
    return { model: fallback, overrode: true, staleEnvValue: envValue };
  }
  return { model: envValue || fallback, overrode: false, staleEnvValue: null };
}

// ---- 5. Groq (text + vision) ----
async function checkGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return log('GROQ_API_KEY', 'SKIP', 'not set — receipt autofill falls back to OCR.space/regex only');
  }
  const { model, overrode, staleEnvValue } = resolveGroqModel(process.env.GROQ_MODEL, 'openai/gpt-oss-120b');
  try {
    const res = await withTimeout(
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
          max_tokens: 5,
        }),
      }),
      10000,
      'groq'
    );
    if (res.status === 401) {
      return log('GROQ_API_KEY', 'FAIL', 'auth rejected (401) — key is invalid');
    }
    if (res.status === 404) {
      const body = await res.text();
      return log('GROQ_API_KEY', 'FAIL', `model "${model}" not found (404): ${body.slice(0, 120)}`);
    }
    if (!res.ok) {
      const body = await res.text();
      return log('GROQ_API_KEY', 'FAIL', `HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
    if (overrode) {
      log('GROQ_API_KEY', 'PASS', `key OK, using "${model}" (your GROQ_MODEL="${staleEnvValue}" is retired and is auto-ignored by the app — safe to remove from .env)`);
    } else {
      log('GROQ_API_KEY', 'PASS', `key + model OK (${model})`);
    }
  } catch (err) {
    log('GROQ_API_KEY', 'FAIL', `network error: ${err.message}${err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : ''}`);
  }

  // Vision model check (separate model, separate failure mode)
  const visionModel = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
  try {
    const res = await withTimeout(
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: visionModel,
          messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
          max_tokens: 5,
        }),
      }),
      10000,
      'groq-vision'
    );
    if (res.status === 404) {
      return log('GROQ_VISION_MODEL', 'FAIL', `"${visionModel}" not found/retired — check https://console.groq.com/docs/models`);
    }
    if (!res.ok) {
      const body = await res.text();
      return log('GROQ_VISION_MODEL', 'FAIL', `HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
    log('GROQ_VISION_MODEL', 'PASS', `"${visionModel}" reachable`);
  } catch (err) {
    log('GROQ_VISION_MODEL', 'FAIL', `network error: ${err.message}${err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : ''}`);
  }
}

// ---- 6. Brevo (transactional email) ----
async function checkSmtp() {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL } = process.env;
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    return log('BREVO', 'SKIP', 'BREVO_API_KEY / BREVO_SENDER_EMAIL not fully set — email runs in STUB mode (logs only)');
  }
  try {
    const res = await withTimeout(
      fetch('https://api.brevo.com/v3/account', {
        method: 'GET',
        headers: { accept: 'application/json', 'api-key': BREVO_API_KEY },
      }),
      10000,
      'brevo',
    );
    if (!res.ok) {
      const body = await res.text();
      return log('BREVO', 'FAIL', `HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
    log('BREVO', 'PASS', `API key accepted, sender ${BREVO_SENDER_EMAIL}`);
  } catch (err) {
    log('BREVO', 'FAIL', err.message.split('\n')[0]);
  }
}

// ---- 7. Supabase Storage ----
async function checkSupabase() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const bucket = process.env.SUPABASE_RECEIPTS_BUCKET || 'receipts';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return log('SUPABASE', 'SKIP', 'not set — receipts fall back to local disk storage');
  }
  try {
    const res = await withTimeout(
      fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucket}`, {
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
      }),
      8000,
      'supabase'
    );
    if (res.status === 401 || res.status === 403) {
      return log('SUPABASE', 'FAIL', `auth rejected (${res.status}) — service role key invalid`);
    }
    if (res.status === 404) {
      return log('SUPABASE', 'FAIL', `bucket "${bucket}" not found — create it in Storage settings`);
    }
    if (!res.ok) {
      const body = await res.text();
      return log('SUPABASE', 'FAIL', `HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
    log('SUPABASE', 'PASS', `bucket "${bucket}" reachable`);
  } catch (err) {
    log('SUPABASE', 'FAIL', `network error: ${err.message}${err.cause ? ` — cause: ${err.cause.code || err.cause.message || err.cause}` : ''}`);
  }
}

async function main() {
  console.log('Checking backend credentials against live services...\n');

  await checkDatabase();
  checkJwtSecrets();
  await checkVeritas();
  await checkOcrSpace();
  await checkGroq();
  await checkSmtp();
  await checkSupabase();

  const failed = results.filter((r) => r.status === 'FAIL');
  console.log('\n' + '-'.repeat(60));
  if (failed.length === 0) {
    console.log('All configured credentials look good.');
  } else {
    console.log(`${failed.length} check(s) failed:`);
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exitCode = 1;
  }
}

main();
