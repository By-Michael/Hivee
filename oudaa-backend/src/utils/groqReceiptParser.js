// -----------------------------------------------------------------------
// Takes raw OCR text from a payment screenshot and asks a Groq-hosted LLM
// to classify which substrings are the amount, sender/account name,
// transaction ID, bank name, and date. This exists because OCR.space
// returns an unstructured text blob — it doesn't know "1,250.00 ETB" is
// the amount vs. a stray number, or that a 10-digit string is a phone
// number and not a transaction reference. An LLM reading the text with
// labeled context does a much better job of that classification than
// regex alone, especially across the many different bank receipt layouts
// in circulation.
//
// This module NEVER sees the image — only the OCR text — so it cannot fix
// a bad OCR read, only interpret a decent one better. Output is always a
// best-effort suggestion; nothing here is trusted for verification.
// -----------------------------------------------------------------------

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.1-8b-instant was retired by Groq — keeping it as the default here
// silently 400'd on every single call, which is why classification looked
// "broken" even though OCR.space itself was returning text fine. Groq's
// migration guidance points text-only traffic at gpt-oss-120b now. Override
// via env if you want a different model.
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
// Vision-capable model used to read the receipt image directly (see
// extractReceiptFieldsFromImage below). Override via env — Groq's
// multimodal lineup changes fairly often.
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';

const SYSTEM_PROMPT = `You extract structured fields from OCR text of a bank payment/transfer receipt or screenshot. The OCR text may be messy, have broken line breaks, or missing spaces.

Return ONLY a JSON object, no prose, no markdown fences, with exactly these keys:
{
  "amount": number or null,       // the transferred amount, as a plain number, no currency symbol or commas
  "name": string or null,         // the sender's / payer's name (not the recipient/bank staff)
  "txnId": string or null,        // transaction ID / reference number / FT number
  "bankName": string or null,     // the bank or mobile money provider name
  "date": string or null          // transaction date, ISO 8601 (YYYY-MM-DD) if you can determine it, else null
}

Rules:
- If a field is not clearly present in the text, use null. Never guess or invent a value.
- amount must be a plain JSON number (e.g. 1250.5), not a string, not formatted with commas or currency symbols.
- Do not confuse a phone number, account number, or reference-looking noise for the transaction ID unless it is labeled as such or is the most plausible candidate.
- Respond with the JSON object only.`;

// Same schema/rules, but reading the receipt image directly instead of an
// OCR text blob — see extractReceiptFieldsFromImage for why this is the
// primary path now.
const VISION_SYSTEM_PROMPT = `You read a photo or screenshot of a bank payment/transfer receipt and extract structured fields directly from the image. The image may be a phone screenshot, a photo of a printed receipt, low resolution, glare, or an unfamiliar bank app layout — read it as carefully as a human would.

Return ONLY a JSON object, no prose, no markdown fences, with exactly these keys:
{
  "amount": number or null,       // the transferred amount, as a plain number, no currency symbol or commas
  "name": string or null,         // the sender's / payer's name (not the recipient/bank staff)
  "txnId": string or null,        // transaction ID / reference number / FT number
  "bankName": string or null,     // the bank or mobile money provider name
  "date": string or null          // transaction date, ISO 8601 (YYYY-MM-DD) if you can determine it, else null
}

Rules:
- If a field is not clearly visible or legible, use null. Never guess or invent a value.
- amount must be a plain JSON number (e.g. 1250.5), not a string, not formatted with commas or currency symbols.
- Do not confuse a phone number, account number, or reference-looking noise for the transaction ID unless it is labeled as such or is the most plausible candidate.
- Respond with the JSON object only.`;

// Defensive normalization — never trust the model to perfectly follow the
// schema, especially on amount's type. Shared by both the text and vision
// extraction paths since they return the same shape.
function normalizeParsedFields(parsed) {
  const amount = typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
    ? parsed.amount
    : (typeof parsed.amount === 'string' && parsed.amount.trim() !== '' && !Number.isNaN(Number(parsed.amount.replace(/,/g, '')))
      ? Number(parsed.amount.replace(/,/g, ''))
      : null);

  return {
    amount,
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null,
    txnId: typeof parsed.txnId === 'string' && parsed.txnId.trim() ? parsed.txnId.trim() : null,
    bankName: typeof parsed.bankName === 'string' && parsed.bankName.trim() ? parsed.bankName.trim() : null,
    date: typeof parsed.date === 'string' && parsed.date.trim() ? parsed.date.trim() : null,
  };
}

/**
 * @param {string} rawText - OCR-extracted text from the receipt image
 * @param {{txnId: string|null, name: string|null}} regexHints - best-effort
 *   regex matches, passed in as a hint since they're sometimes right and
 *   can anchor the model, but the model is free to disagree with them.
 * @returns {Promise<{amount:number|null,name:string|null,txnId:string|null,bankName:string|null,date:string|null}|null>}
 *   Returns null (never throws) if Groq isn't configured — caller falls
 *   back to regex-only. Throws on a configured-but-failed call so the
 *   caller can log it distinctly from "not configured".
 */
async function extractReceiptFields(rawText, regexHints = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null; // not configured — silent fallback to regex

  const userContent = [
    'OCR text from the receipt:',
    '"""',
    rawText.slice(0, 4000), // guard against pathological OCR output
    '"""',
    '',
    `Regex already guessed txnId="${regexHints.txnId || ''}" and name="${regexHints.name || ''}" — use these as hints only if they look right; ignore them if you find better matches.`,
  ].join('\n');

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`Groq API request failed (${res.status}): ${bodyText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq response had no content');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`Groq response was not valid JSON: ${content.slice(0, 200)}`);
  }

  return normalizeParsedFields(parsed);
}

/**
 * Reads the receipt image directly with a Groq vision model, instead of
 * classifying OCR.space's text output. This is the main accuracy fix:
 * OCR.space is a classic OCR engine and struggles with phone-screenshot
 * receipts (small fonts, colored app backgrounds, glare on photos), and
 * once it mangles a character there is no way for a downstream text-only
 * model to recover it. A vision model reads the pixels itself, so it isn't
 * bottlenecked by a lossy intermediate text extraction.
 *
 * @param {Buffer} fileBuffer
 * @param {string} mimetype
 * @returns {Promise<{amount:number|null,name:string|null,txnId:string|null,bankName:string|null,date:string|null}|null>}
 *   Returns null (never throws) if Groq isn't configured — caller falls
 *   back to the OCR.space + regex/text-Groq pipeline. Throws on a
 *   configured-but-failed call so the caller can log it distinctly.
 */
async function extractReceiptFieldsFromImage(fileBuffer, mimetype) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null; // not configured — caller falls back

  const base64 = fileBuffer.toString('base64');
  const dataUrl = `data:${mimetype || 'image/jpeg'};base64,${base64}`;

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the fields from this payment receipt image.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`Groq vision API request failed (${res.status}): ${bodyText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq vision response had no content');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`Groq vision response was not valid JSON: ${content.slice(0, 200)}`);
  }

  return normalizeParsedFields(parsed);
}

function isStubActive() {
  return !process.env.GROQ_API_KEY;
}

module.exports = { extractReceiptFields, extractReceiptFieldsFromImage, isStubActive };
