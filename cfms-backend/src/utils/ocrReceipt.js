// -----------------------------------------------------------------------
// Screenshot autofill: sends the uploaded payment screenshot to OCR.space
// to get raw text, then applies best-effort heuristics to pull out a
// transaction ID and a sender name from it. OCR.space returns plain text,
// not structured fields, so this is pattern-matching over that text —
// treat the result as a prefill suggestion, not ground truth. The caller
// (paymentController) never trusts this for verification; only the typed/
// confirmed txnId is ever sent to verifyBankTransaction.
// -----------------------------------------------------------------------

const AppError = require('../utils/AppError');

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
 * @returns {Promise<{ txnId: string|null, name: string|null, rawText: string }>}
 */
async function parseReceiptImage(fileBuffer, mimetype, filename) {
  const rawText = await ocrSpaceParse(fileBuffer, mimetype, filename);
  return {
    txnId: extractTxnId(rawText),
    name: extractName(rawText),
    rawText,
  };
}

module.exports = { parseReceiptImage };
