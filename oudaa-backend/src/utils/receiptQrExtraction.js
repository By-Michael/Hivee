// -----------------------------------------------------------------------
// CBE receipt QR / reference extraction.
//
// CBE's resident-facing payment flow (see selfVerifyPayment's CBE branch
// in paymentController.js) never asks the resident to type a transaction
// ID — CBE no longer keeps the old FT-reference + account-suffix scheme
// working reliably, so instead the resident gives us the e-receipt
// itself, one of three ways:
//   1. A pasted link to the CBE receipt page, e.g.
//        https://mbreciept.cbe.com.et/v2-hfHCxGyqqkTGs6V4eO3t
//      This link (or its trailing token) IS the reference — nothing to
//      extract, just pass it straight through to bankVerification.js.
//   2. An uploaded screenshot (jpg/png/webp) of the receipt, which has
//      CBE's own QR code printed on it. We decode that QR to recover the
//      same kind of link/token as (1).
//   3. An uploaded PDF of the receipt (what CBE itself hands out) —
//      same QR code, just embedded in a PDF page instead of a flat
//      image. We rasterize page 1 and decode the QR the same way.
//
// The decoded QR payload is then handed to the same Veritas fork used
// for Telebirr (see bankVerification.js) via provider 'cbe' — the fork
// (https://github.com/By-Michael/verifier-api) already knows how to read
// both the legacy `apps.cbe.com.et/?id=...` link *and* the new
// `mbreciept.cbe.com.et/<token>` link/token directly (see
// verifyCBE()/extractNewCbeToken() in its src/utils/cbeReference.ts +
// src/services/verifyCBE.ts) by hitting CBE's own mobile-app JSON API —
// no PDF scraping needed on that side. So this module's only job is:
// get *some* string that is either the pasted link or a QR-decoded
// link/token, and let bankVerification.js do the rest.
// -----------------------------------------------------------------------

const jsQR = require('jsqr');

// Matches either CBE receipt link shape well enough to short-circuit QR
// decoding when the resident just pasted the link directly. Kept
// deliberately loose — the Veritas fork does the authoritative parsing/
// validation; this is just "does this look like it's worth sending on".
const CBE_LINK_RE = /^https?:\/\/(mbreciept\.cbe\.com\.et|apps\.cbe\.com\.et)\b/i;

function isLikelyCbeReceiptLink(value) {
  return typeof value === 'string' && CBE_LINK_RE.test(value.trim());
}

/**
 * Decode a QR code out of raw image bytes (jpg/png/webp/bmp/gif — whatever
 * Jimp can read) using jsQR. Returns the QR's raw string payload, or null
 * if no QR was found.
 */
async function decodeQrFromImageBuffer(buffer) {
  // Lazy-required: Jimp is only needed on this path, and importing it
  // eagerly at module load would slow down every cold start for a
  // feature most requests never touch.
  const { Jimp } = require('jimp');
  const image = await Jimp.read(buffer);

  // jsQR wants a flat RGBA Uint8ClampedArray plus width/height — exactly
  // what Jimp's `.bitmap` already is.
  const { data, width, height } = image.bitmap;
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

  let code = jsQR(rgba, width, height, { inversionAttempts: 'attemptBoth' });
  if (code?.data) return code.data;

  // Receipts are often screenshotted at high resolution with the QR as a
  // small corner element — downscaling sometimes helps jsQR when the
  // full-res scan fails (rare, but cheap to try once more).
  if (width > 1600) {
    const scaled = image.clone().resize({ w: 1600 });
    const s = scaled.bitmap;
    const sRgba = new Uint8ClampedArray(s.data.buffer, s.data.byteOffset, s.data.byteLength);
    code = jsQR(sRgba, s.width, s.height, { inversionAttempts: 'attemptBoth' });
    if (code?.data) return code.data;
  }

  return null;
}

/**
 * Rasterize page 1 of a PDF to an RGBA bitmap using pdfjs-dist +
 * @napi-rs/canvas (a prebuilt, no-native-build-step canvas — avoids
 * requiring a full native toolchain just to render one page), then
 * decode a QR out of that bitmap the same way as an image upload.
 */
async function decodeQrFromPdfBuffer(buffer) {
  // Lazy-required for the same cold-start reason as Jimp above, and
  // because these are the heaviest deps this module pulls in.
  const { createCanvas } = require('@napi-rs/canvas');
  // pdfjs-dist ships ESM-only (.mjs) as of v6 — bridge it into this
  // CommonJS module with a dynamic import rather than require().
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    // No worker in a plain Node process — pdfjs runs the parse inline.
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const pdfDoc = await loadingTask.promise;

  try {
    const page = await pdfDoc.getPage(1);
    // CBE's QR is small relative to the page — render at 2x to give jsQR
    // enough resolution to lock onto the finder patterns reliably.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return code?.data || null;
  } finally {
    // Guard: not every pdfjs build/version exposes destroy() the same
    // way, and a cleanup failure here must never clobber the actual
    // decode result returned from the try block above.
    if (typeof pdfDoc?.destroy === 'function') {
      await pdfDoc.destroy().catch(() => {});
    }
  }
}

/**
 * @param {object} params
 * @param {Buffer} [params.fileBuffer] - The uploaded receipt file's bytes, if a file was uploaded.
 * @param {string} [params.mimetype] - The uploaded file's mimetype.
 * @param {string} [params.receiptLink] - A pasted link to the receipt instead of a file upload.
 * @returns {Promise<{ reference: string | null, suffix: string | null, source: 'link'|'qr-image'|'qr-pdf'|null }>}
 *   `reference` is whatever string should be sent to bankVerification.js
 *   as `txnId` for provider 'cbe' — either the pasted link itself, or
 *   the QR payload decoded off the upload. Null when nothing usable was
 *   found (caller falls back to PENDING_REVIEW, same as before).
 */
async function extractCbeReferenceFromReceipt({ fileBuffer, mimetype, receiptLink } = {}) {
  if (isLikelyCbeReceiptLink(receiptLink)) {
    return { reference: receiptLink.trim(), suffix: null, source: 'link' };
  }

  if (!fileBuffer) {
    return { reference: null, suffix: null, source: null };
  }

  try {
    const isPdf = mimetype === 'application/pdf';
    const qrPayload = isPdf
      ? await decodeQrFromPdfBuffer(fileBuffer)
      : await decodeQrFromImageBuffer(fileBuffer);

    if (!qrPayload) {
      return { reference: null, suffix: null, source: null };
    }

    // CBE's QR payload is itself a URL (legacy `apps.cbe.com.et/?id=...`
    // or the new `mbreciept.cbe.com.et/<token>`) — pass it straight
    // through and let bankVerification.js / the Veritas fork's own
    // extractLegacyCbeUrlData / extractNewCbeToken parse it. If CBE ever
    // ships a QR payload that ISN'T a recognizable link, still forward it
    // rather than silently dropping it — the fork's /verify-cbe route
    // will reject an unparseable reference with a clear 400 instead of us
    // guessing at a new format here.
    return { reference: qrPayload.trim(), suffix: null, source: isPdf ? 'qr-pdf' : 'qr-image' };
  } catch (err) {
    console.error('[receiptQrExtraction] QR decode failed:', err.message);
    return { reference: null, suffix: null, source: null };
  }
}

module.exports = { extractCbeReferenceFromReceipt, isLikelyCbeReceiptLink };
