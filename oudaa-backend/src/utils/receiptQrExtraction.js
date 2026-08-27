// -----------------------------------------------------------------------
// CBE receipt QR / reference extraction — STUB.
//
// CBE's resident-facing payment flow (see selfVerifyPayment's CBE branch
// in paymentController.js) intentionally drops the manual transaction-ID
// / account-suffix fields: CBE e-receipts (screenshot or PDF) carry a QR
// code that encodes the transaction reference, and the plan is to decode
// that QR directly instead of asking the resident to type anything.
//
// That decoder isn't wired up yet. Until it is, every CBE self-verified
// payment is queued to PENDING_REVIEW for a human to check the uploaded
// receipt against — see the 'CBE receipt uploaded' reviewFlag. This
// module exists so that wiring is a single, obvious place to land:
// resolve this function to return a real reference (and it starts
// flowing into verifyBankTransaction automatically) instead of hunting
// through the controller for where to plug it in.
//
// Likely real implementation, when it's time:
//   - Image (jpg/png/webp): run a QR decoder (e.g. `jsqr` after
//     rasterizing, or a barcode-reading OCR service) over the buffer.
//   - PDF: rasterize the first page (e.g. via `pdfjs-dist` or
//     `pdf-to-img`) then run the same QR decoder over it.
//   - CBE's QR payload is a URL containing the reference as a query
//     param (format has shifted before — verify against a live receipt
//     before hardcoding a parse pattern).
// -----------------------------------------------------------------------

/**
 * @param {object} params
 * @param {Buffer} [params.fileBuffer] - The uploaded receipt file's bytes, if a file was uploaded.
 * @param {string} [params.mimetype] - The uploaded file's mimetype.
 * @param {string} [params.receiptLink] - A pasted link to the receipt instead of a file upload.
 * @returns {Promise<{ reference: string | null, suffix: string | null }>}
 *   Always returns nulls today (stub). Once implemented, a non-null
 *   `reference` lets selfVerifyPayment call verifyBankTransaction for CBE
 *   the same way it already does for every other provider.
 */
async function extractCbeReferenceFromReceipt({ fileBuffer, mimetype, receiptLink } = {}) {
  // Intentionally not implemented yet — see module header.
  return { reference: null, suffix: null };
}

module.exports = { extractCbeReferenceFromReceipt };
