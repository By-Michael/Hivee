// -----------------------------------------------------------------------
// Bank transaction verification.
//
// *** THIS IS A STUB. Replace with the real bank verification API. ***
//
// The real integration (per the product plan) is: given a bank
// transaction ID, call the bank's lookup API and get back who sent the
// money, who received it, how much, when, and any reference/reason
// attached to the transfer. We don't have credentials for that API yet,
// so this stub simulates a lookup with the same shape the real one will
// return, so every caller (paymentController, and the frontend that
// consumes it) can be built against the final contract now and the swap
// later is a one-function change — nothing else needs to move.
//
// To wire up the real API: replace the body of `verifyBankTransaction`
// below with an actual HTTP call, keeping the same input/output shape.
// Config for it (base URL, API key) should go through process.env, e.g.
// BANK_VERIFY_API_URL / BANK_VERIFY_API_KEY in .env.
// -----------------------------------------------------------------------

const AppError = require('./AppError');

/**
 * @param {object} params
 * @param {string} params.txnId - The transaction ID the resident typed in.
 * @param {number} params.expectedAmount - The fee amount the payment should match.
 * @param {string} [params.expectedAccountNumber] - The community's receiving account.
 * @returns {Promise<{
 *   matched: boolean,
 *   senderName: string | null,
 *   receiverName: string | null,
 *   receiverAccount: string | null,
 *   amount: number | null,
 *   date: string | null,
 *   reference: string | null,
 *   reason: string | null,
 * }>}
 */
async function verifyBankTransaction({ txnId, expectedAmount, expectedAccountNumber }) {
  const id = (txnId || '').trim();

  if (!id) {
    throw new AppError('Transaction ID is required', 422);
  }
  if (id.length < 6) {
    // Real bank txn IDs are always longer than this — reject obvious typos
    // early instead of pretending to look it up.
    return { matched: false, reason: 'Transaction ID looks too short to be valid.' };
  }

  // ---- STUB BEHAVIOR ----
  // Simulate network latency like a real API call would have.
  await new Promise((resolve) => setTimeout(resolve, 900));

  // Simulate an occasional "not found" the way a real bank API would for
  // a mistyped ID, so the UI's failure path is exercised in demos too.
  // (Deterministic on the txn ID itself, not random, so retesting the
  // same ID gives a consistent result.)
  const looksInvalid = /^0+$/.test(id) || id.toUpperCase() === 'INVALID';
  if (looksInvalid) {
    return {
      matched: false,
      senderName: null,
      receiverName: null,
      receiverAccount: null,
      amount: null,
      date: null,
      reference: id,
      reason: 'No transaction found with this ID.',
    };
  }

  // Otherwise, the stub "confirms" the transfer against what the resident
  // is trying to pay — this is the part a real API call would actually
  // determine independently instead of trusting the caller.
  return {
    matched: true,
    senderName: null, // stub can't independently know this — caller trusts payerName
    receiverName: null,
    receiverAccount: expectedAccountNumber || null,
    amount: expectedAmount,
    date: new Date().toISOString(),
    reference: id,
    reason: null,
  };
}

module.exports = { verifyBankTransaction };
