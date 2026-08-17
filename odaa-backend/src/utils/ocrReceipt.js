// -----------------------------------------------------------------------
// Screenshot autofill: sends the uploaded payment screenshot to OCR.space
// to get raw text, then to Groq (an LLM) to turn that raw, messy text into
// structured fields. OCR.space alone only returns a flat text blob with no
// concept of "this number is the amount vs. this is the txn ID" — regex
// heuristics over that text are brittle across the many different bank
// receipt layouts. Groq is asked to read the OCR text and *classify* which
// substrings are which field, given the fields already found by regex as a
// hint. It is NOT given the image — it never re-does OCR, it only
// interprets text OCR already extracted, so a bad OCR read stays a bad OCR
// read either way; this step only helps when the raw text is decent but
// unstructured.
// Treat all of this as a prefill suggestion, never ground truth — the
// resident still sees and can correct every field, and the caller
// (paymentController) never trusts txnId/amount for verification purposes
// without the bank lookup in bankVerification.js.
// -----------------------------------------------------------------------

const AppError = require('../utils/AppError');
const { extractReceiptFields } = require('./groqReceiptParser');

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

async function ocrSpaceParse(fileBuffer, mimetype, filename) {
  const apiKey = process.env.OCRSPACE_API_KEY;
  if (!apiKey) {
    throw new AppError('OCR is not configured on the server (missing OCRSPACE_API_KEY)', 500);
  }

  const form = new FormData();
  form.append('apikey', apiKey);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('OCREngine', '2');
  form.append('scale', 'true');
  form.append('file', new Blob([fileBuffer], { type: mimetype }), filename || 'receipt.jpg');

  const res = await fetch(OCR_SPACE_URL, { method: 'POST', body: form });
  if (!res.ok) {
    throw new AppError('OCR service request failed', 502);
  }
  const data = await res.json();

  if (data.IsErroredOnProcessing) {
    throw new AppError(
      Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join('; ') : data.ErrorMessage || 'OCR failed to read this image',
      422
    );
  }

  const text = (data.ParsedResults || []).map((r) => r.ParsedText).join('\n');
  return text || '';
}

// ---- heuristic extraction over the raw OCR text ----

const TXN_LABEL_RE = /(?:txn|transaction|trans(?:fer)?|reference|ref)\s*(?:id|no\.?|number)?\s*[:\-]?\s*([A-Z0-9\-]{6,})/i;
// Fallback: any standalone alphanumeric token that mixes letters and
// digits and is long enough to plausibly be a bank reference.
const GENERIC_TOKEN_RE = /\b(?=[A-Z0-9]{6,20}\b)(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,20}\b/;

const NAME_LABEL_RE = /(?:sender|from|payer|account\s*name|name)\s*[:\-]?\s*([A-Za-z][A-Za-z .'\-]{2,60})/i;

function extractTxnId(text) {
  const labeled = text.match(TXN_LABEL_RE);
  if (labeled) return labeled[1].trim();
  const generic = text.toUpperCase().match(GENERIC_TOKEN_RE);
  return generic ? generic[0] : null;
}

function extractName(text) {
  const labeled = text.match(NAME_LABEL_RE);
  if (labeled) {
    // Trim trailing junk the regex may have swept in (next label, newline text).
    return labeled[1].split('\n')[0].trim().replace(/\s{2,}/g, ' ');
  }
  return null;
}

/**
 * @returns {Promise<{
 *   txnId: string|null, name: string|null, amount: number|null,
 *   bankName: string|null, date: string|null,
 *   source: 'groq'|'regex', rawText: string
 * }>}
 */
async function parseReceiptImage(fileBuffer, mimetype, filename) {
  const rawText = await ocrSpaceParse(fileBuffer, mimetype, filename);

  // Regex pass always runs first — it's free, fast, and is the fallback if
  // Groq is unavailable or returns something unusable.
  const regexResult = {
    txnId: extractTxnId(rawText),
    name: extractName(rawText),
    amount: null,
    bankName: null,
    date: null,
  };

  if (!rawText.trim()) {
    return { ...regexResult, source: 'regex', rawText };
  }

  try {
    const aiResult = await extractReceiptFields(rawText, regexResult);
    if (aiResult) {
      return {
        txnId: aiResult.txnId ?? regexResult.txnId,
        name: aiResult.name ?? regexResult.name,
        amount: aiResult.amount ?? null,
        bankName: aiResult.bankName ?? null,
        date: aiResult.date ?? null,
        source: 'groq',
        rawText,
      };
    }
  } catch (err) {
    // Groq being down/misconfigured/rate-limited must never block the
    // upload flow — the regex result is still a usable prefill.
    console.error('[ocrReceipt] Groq extraction failed, falling back to regex:', err.message);
  }

  return { ...regexResult, source: 'regex', rawText };
}

function isStubActive() {
  return !process.env.OCRSPACE_API_KEY;
}

module.exports = { parseReceiptImage, isStubActive };
