// -----------------------------------------------------------------------
// Adapter layer between the UI's simple data shapes (used by every page in
// src/pages/**) and the real Oudaa backend's Prisma/REST contract.
//
// Why this file exists:
// The UI was originally built against a mock, denormalized data model
// (e.g. payment.status === 'paid', resident.unit, fund.balance). The real
// backend uses UUIDs, enums (PENDING/VERIFIED/REJECTED), and a normalized
// relational schema. Rather than rewrite every page (high risk, low value),
// this module translates cleanly in both directions so pages keep working
// unmodified while every read/write goes through the real API.
//
// Every UI field the pages rely on now has a real column behind it — fund
// goal and receipt verified used to be kept in a localStorage-only overlay
// (device-specific, gone if storage was cleared), but both are now real
// Fund/Receipt columns, so they're written and read through the API like
// everything else.
// -----------------------------------------------------------------------


// ------------------------------- enums ---------------------------------
const RESIDENT_STATUS_TO_UI = { ACTIVE: 'active', INACTIVE: 'inactive', MOVED_OUT: 'inactive' }
const RESIDENT_STATUS_TO_API = { active: 'ACTIVE', inactive: 'INACTIVE' }

const FEE_FREQ_TO_UI = { ONE_TIME: 'one-time', MONTHLY: 'monthly', QUARTERLY: 'quarterly', YEARLY: 'yearly' }
const FEE_FREQ_TO_API = { 'one-time': 'ONE_TIME', monthly: 'MONTHLY', quarterly: 'QUARTERLY', yearly: 'YEARLY' }

const PAYMENT_METHOD_TO_UI = {
  CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', MOBILE_MONEY: 'Mobile Money', CARD: 'Card', OTHER: 'Other',
}
const PAYMENT_METHOD_TO_API = {
  Cash: 'CASH', 'Bank Transfer': 'BANK_TRANSFER', 'Mobile Money': 'MOBILE_MONEY', Card: 'CARD', Other: 'OTHER',
}

// PENDING_REVIEW = bank lookup matched, but our safeguard check (name/amount
// cross-check, or above the auto-verify threshold) flagged it for an admin
// to confirm — distinct from a plain PENDING (no bank match attempted yet).
const PAYMENT_STATUS_TO_UI = { PENDING: 'pending', PENDING_REVIEW: 'pending_review', VERIFIED: 'paid', REJECTED: 'rejected' }

const PROJECT_STATUS_TO_UI = { PLANNED: 'planned', ONGOING: 'in-progress', COMPLETED: 'completed', CANCELLED: 'cancelled' }
const PROJECT_STATUS_TO_API = { planned: 'PLANNED', 'in-progress': 'ONGOING', completed: 'COMPLETED', cancelled: 'CANCELLED' }

// Broadened from the original 4 to cover more of what communities actually
// collect for — still a suggested list (see Funds.jsx: the select allows
// picking "Other" and typing a custom value), not a hard enum, since
// category is a plain string column, not a DB enum.
export const FUND_CATEGORIES = [
  'Security', 'Utilities', 'Maintenance', 'Development',
  'Landscaping', 'Sanitation', 'Emergency', 'Events', 'Administration', 'Insurance',
]

// ------------------------------ residents -------------------------------
// phone, idNumber, address, and ownerType are real columns on Resident.
const OWNER_TYPE_TO_UI = { OWNER: 'owner', RENTER: 'renter' }
const OWNER_TYPE_TO_API = { owner: 'OWNER', renter: 'RENTER' }

export function residentToUI(r) {
  return {
    id: r.id,
    name: r.user?.fullName ?? r.fullName ?? '',
    unit: r.unitNumber ?? '',
    phone: r.phone ?? '',
    email: r.user?.email ?? r.email ?? '',
    idNumber: r.idNumber ?? '',
    address: r.address ?? '',
    ownerType: OWNER_TYPE_TO_UI[r.ownerType] || 'owner',
    status: RESIDENT_STATUS_TO_UI[r.status] || 'active',
    // Why/when the account was last deactivated — null while active. See
    // "Deactivate resident" flow in Residents.jsx.
    inactiveReason: r.inactiveReason ?? '',
    inactivatedAt: r.inactivatedAt ?? null,
    joined: r.joinedAt,
    userId: r.userId ?? r.user?.id,
    // True when this resident record belongs to a committee member (a
    // resident who was promoted to ADMIN). Committee members keep their
    // resident row, so they still show up in this list, but they can't be
    // removed from here — see Residents.jsx.
    isCommittee: (r.user?.role ?? r.role) === 'ADMIN',
  }
}

export function residentToCreateAPI(form) {
  return {
    fullName: form.name,
    email: form.email,
    password: form.password,
    unitNumber: form.unit,
    // No status here — every resident is created ACTIVE by the backend.
    // Deactivation is a separate, reason-required action (see
    // deactivateResident/reactivateResident in DataContext.jsx).
    phone: form.phone || undefined,
    idNumber: form.idNumber || undefined,
    address: form.address || undefined,
    ownerType: OWNER_TYPE_TO_API[form.ownerType] || 'OWNER',
  }
}

export function residentToUpdateAPI(form) {
  return {
    fullName: form.name,
    email: form.email || undefined,
    unitNumber: form.unit,
    // Status is intentionally omitted — see residentToCreateAPI above.
    phone: form.phone || undefined,
    idNumber: form.idNumber || undefined,
    address: form.address || undefined,
    ownerType: OWNER_TYPE_TO_API[form.ownerType] || 'OWNER',
  }
}

// Missing-payments summary returned by GET /residents/:id/summary
export function missingPaymentToUI(m) {
  return {
    feeId: m.feeId,
    name: m.name,
    amount: Number(m.amount),
    frequency: FEE_FREQ_TO_UI[m.frequency] || 'monthly',
  }
}

// --------------------------------- fees ----------------------------------
export function feeToUI(f) {
  return {
    id: f.id,
    name: f.name,
    amount: Number(f.amount),
    frequency: FEE_FREQ_TO_UI[f.frequency] || 'monthly',
    // Day of the month this fee recurs on — required for every frequency
    // except one-time (see AddFee form in Fees.jsx).
    dueDay: f.dueDay ?? '',
    category: f.description || 'Security',
  }
}

export function feeToAPI(form) {
  return {
    name: form.name,
    amount: Number(form.amount),
    frequency: FEE_FREQ_TO_API[form.frequency] || 'MONTHLY',
    dueDay: form.frequency === 'one-time' ? undefined : (form.dueDay ? Number(form.dueDay) : undefined),
    description: form.category,
  }
}

// ------------------------------- payment methods ---------------------------
// A community's configured ways to receive money (CBE, Telebirr, other
// banks...). The backend shape (schema.prisma CommunityPaymentMethod) is
// already camelCase and matches what the UI needs field-for-field, so this
// just normalizes nulls to '' so <input>s stay controlled.
export function paymentMethodToUI(m) {
  return {
    id: m.id,
    provider: m.provider,
    label: m.label || '',
    bankName: m.bankName || '',
    accountName: m.accountName || '',
    accountNumber: m.accountNumber || '',
    fullName: m.fullName || '',
    phoneNumber: m.phoneNumber || '',
    isActive: m.isActive !== false,
    sortOrder: m.sortOrder ?? 0,
  }
}

export function paymentMethodToAPI(form) {
  const isTelebirr = form.provider === 'TELEBIRR'
  return {
    provider: form.provider,
    label: form.label.trim(),
    bankName: isTelebirr ? undefined : (form.bankName || '').trim() || undefined,
    accountName: isTelebirr ? undefined : (form.accountName || '').trim() || undefined,
    accountNumber: isTelebirr ? undefined : (form.accountNumber || '').trim() || undefined,
    fullName: isTelebirr ? (form.fullName || '').trim() || undefined : undefined,
    phoneNumber: isTelebirr ? (form.phoneNumber || '').trim() || undefined : undefined,
    isActive: form.isActive !== false,
  }
}

// ------------------------------- payments ---------------------------------
export function paymentToUI(p) {
  return {
    id: p.id,
    residentId: p.residentId,
    feeId: p.feeId || '',
    projectId: p.projectId || '',
    projectName: p.project?.name || '',
    fundId: p.fundId || '',
    fundName: p.fund?.name || '',
    amount: Number(p.amount),
    date: p.paidAt,
    method: PAYMENT_METHOD_TO_UI[p.paymentMethod] || 'Cash',
    status: PAYMENT_STATUS_TO_UI[p.status] || 'pending',
    reference: p.transactionReference || '',
    payerName: p.payerName || '',
    reason: p.reason || '',
    reviewFlags: p.reviewFlags || '',
    // Who the bank says actually sent the money (from the Veritas lookup),
    // as opposed to `payerName` which is just what the resident typed in.
    // Lets the committee eyeball a mismatch without opening raw JSON.
    senderName: p.senderName || '',
    // Whether this payment's reviewFlags mention it landing in a bank
    // account the community has since replaced (see
    // CommunityBankAccountHistory) — shown as an informational badge
    // rather than the same red "mismatch" styling as a genuine
    // wrong-account flag, since this is expected when the community
    // recently changed accounts.
    paidToPreviousAccount: /PREVIOUS community account/i.test(p.reviewFlags || ''),
    receiptUrl: p.receiptUrl || '',
    // Manually typed in by a committee member (vs. a resident's own
    // bank-verified self-payment) — this is what the UI uses to decide
    // whether to show edit/delete buttons for a row.
    recordedBy: p.recordedBy || '',
    recordedByName: p.recorder?.fullName || '',
  }
}

export function paymentToCreateAPI(form) {
  return {
    residentId: form.residentId || undefined,
    feeId: form.targetType === 'project' ? undefined : form.feeId,
    projectId: form.targetType === 'project' ? form.projectId : undefined,
    amount: Number(form.amount),
    paymentMethod: PAYMENT_METHOD_TO_API[form.method] || 'CASH',
    transactionReference: form.reference || undefined,
  }
}

// Only for editing a manually-recorded payment (see paymentController.js
// updatePayment) — every field optional, only send what actually changed.
export function paymentToUpdateAPI(form) {
  const body = {}
  if (form.targetType === 'project') {
    if (form.projectId) body.projectId = form.projectId
  } else if (form.feeId) {
    body.feeId = form.feeId
  }
  if (form.amount !== undefined && form.amount !== '') body.amount = Number(form.amount)
  if (form.method) body.paymentMethod = PAYMENT_METHOD_TO_API[form.method] || 'CASH'
  if (form.reference !== undefined) body.transactionReference = form.reference || ''
  return body
}

// -------------------------------- funds -----------------------------------
// Fund has no numeric balance column — both numbers below are derived
// server-side (fundController.js:computeFundMoney) each time a fund is
// fetched. `category` and `description` (optional reason/note) are now
// their own real columns (see schema.prisma) — no longer overloading one
// field for the other.
//
// Two distinct numbers, both real, meaning different things:
//   - `budgetRemaining` (allocated - spent): planning view, budget vs actual.
//   - `actualBalance` (verified payments in - spent): real cash view, what
//     the fund actually holds right now. This is the number transparency-
//     minded residents/committees care about; `balance` is kept as an alias
//     of it for any older UI code that hasn't been updated to the new name.
export function fundToUI(f, summary) {
  return {
    id: f.id,
    name: f.name,
    category: f.category || 'Security',
    reason: f.description || '',
    goal: f.goal !== undefined && f.goal !== null ? Number(f.goal) : null,
    balance: summary ? summary.actualBalance : 0, // alias, prefer actualBalance below
    actualBalance: summary ? summary.actualBalance : 0,
    verifiedCollected: summary ? summary.verifiedCollected : 0,
    budgetAllocated: summary ? summary.totalAllocated : 0,
    budgetSpent: summary ? summary.totalSpent : 0,
    budgetRemaining: summary ? summary.remaining : 0,
    projectCount: f._count?.projects ?? summary?.projectCount ?? 0,
  }
}

export function fundToAPI(form) {
  return {
    name: form.name,
    category: form.category,
    description: form.reason || undefined,
    goal: form.goal === '' || form.goal === undefined || form.goal === null ? null : Number(form.goal),
  }
}

// ------------------------------- projects ----------------------------------
export function projectToUI(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    fundId: p.fundId,
    // Multi-fund split, e.g. [{ fundId, fundName, amount }]. Falls back to
    // a single-entry split off fundId/budget for any project fetched
    // before fundAllocations existed / was included.
    fundAllocations: (p.fundAllocations || []).map((a) => ({
      fundId: a.fundId,
      fundName: a.fund?.name || '',
      amount: Number(a.amount),
    })),
    budget: Number(p.budget),
    // list endpoint sends a pre-summed `spent` (see listProjects); the
    // single-project endpoint instead sends the full `expenses` array and
    // no `spent` field, so fall back to summing it here for that case.
    // Reversal entries carry negative amounts, so this sum nets out
    // automatically without any special-casing for voided/reversed rows.
    spent: p.spent !== undefined ? Number(p.spent) : (p.expenses || []).reduce((s, e) => s + Number(e.amount), 0),
    status: PROJECT_STATUS_TO_UI[p.status] || 'planned',
    cancelReason: p.cancelReason || '',
    startDate: p.startDate,
    endDate: p.endDate,
    // Once >0, budget edits need committee approval and there is no
    // delete endpoint at all — only cancelProject (see projectController.js).
    expenseCount: p._count?.expenses ?? (p.expenses ? p.expenses.length : 0),
  }
}

export function projectToAPI(form) {
  const body = {
    fundId: form.fundId,
    name: form.name,
    description: form.description || undefined,
    budget: Number(form.budget),
    // CANCELLED is never sent from here — the backend rejects it anyway
    // (create schema doesn't even accept it; update routes it to a 400
    // pointing at /cancel). Cancellation always goes through
    // projectCancelToAPI below instead.
    status: PROJECT_STATUS_TO_API[form.status] === 'CANCELLED'
      ? 'PLANNED'
      : (PROJECT_STATUS_TO_API[form.status] || 'PLANNED'),
    startDate: form.startDate,
    endDate: form.endDate || undefined,
  }
  // Only send fundAllocations when the user actually split across more
  // than one fund — omitting it lets the backend default to "100% into
  // fundId", which keeps single-fund projects exactly as simple as before.
  if (form.fundAllocations && form.fundAllocations.length > 1) {
    body.fundAllocations = form.fundAllocations.map((a) => ({ fundId: a.fundId, amount: Number(a.amount) }))
  }
  return body
}

// Cancellation is its own endpoint/body — never folded into a generic
// PATCH — so the mandatory reason can't accidentally be omitted.
export function projectCancelToAPI(reason) {
  return { cancelReason: reason }
}

// ------------------------------- expenses -----------------------------------
export function expenseToUI(e) {
  return {
    id: e.id,
    projectId: e.projectId,
    category: e.category || 'OTHER',
    description: e.description || '',
    amount: Number(e.amount),
    vendor: e.vendor || '',
    date: e.spentAt,
    createdAt: e.createdAt,
    recordedBy: e.recordedBy || e.recorder?.id || '',
    bankName: e.bankName || '',
    transactionReference: e.transactionReference || '',
    receiptId: e.receipts?.[0]?.id,
    receiptCount: e.receipts?.length ?? 0,
    // Expenses are append-only: isVoided means this row has since been
    // reversed (a linked negative entry exists); isReversal means THIS row
    // IS that offsetting entry. reversalId/reversesId let the UI link them
    // without a second fetch.
    isVoided: !!e.isVoided,
    isReversal: !!e.reversesId,
    reversesId: e.reversesId || null,
    reversalId: e.reversal?.id || null,
  }
}

export function expenseToAPI(form) {
  return {
    projectId: form.projectId || undefined,
    category: form.category || 'OTHER',
    description: form.description,
    vendor: form.vendor,
    amount: Number(form.amount),
    spentAt: form.date || undefined,
    bankName: form.bankName || undefined,
    transactionReference: form.transactionReference || undefined,
  }
}

// ------------------------------- community -------------------------------------
export function communityToUI(c) {
  return {
    id: c.id,
    name: c.name,
    address: c.address || '',
    contactInfo: c.contactInfo || '',
    paymentBankName: c.paymentBankName || '',
    paymentAccountName: c.paymentAccountName || '',
    paymentAccountNumber: c.paymentAccountNumber || '',
    autoVerifyMaxAmount: c.autoVerifyMaxAmount ?? null,
    bankVerificationStubActive: !!c.bankVerificationStubActive,
  }
}

export function communityToUpdateAPI(form) {
  return {
    name: form.name,
    address: form.address || undefined,
    contactInfo: form.contactInfo || undefined,
    paymentBankName: form.paymentBankName || undefined,
    paymentAccountName: form.paymentAccountName || undefined,
    paymentAccountNumber: form.paymentAccountNumber || undefined,
    autoVerifyMaxAmount: form.autoVerifyMaxAmount === undefined ? undefined : form.autoVerifyMaxAmount,
  }
}

// ------------------------- pending changes (sensitive-action approval) --------
export function pendingChangeToUI(pc) {
  return {
    id: pc.id,
    changeType: pc.changeType,
    entityType: pc.entityType,
    entityId: pc.entityId,
    diff: pc.diff || {},
    status: pc.status,
    proposedBy: pc.proposedBy,
    createdAt: pc.createdAt,
    expiresAt: pc.expiresAt,
    resolvedAt: pc.resolvedAt,
    approvals: pc.approvals || [],
  }
}

// ------------------------------- receipts -------------------------------------
// fileName is derived from fileUrl (no separate display-name column, but
// that's cosmetic and doesn't need persisting). `verified` is a real
// Receipt column now — see PATCH /receipts/:id/verify.
export function receiptToUI(r) {
  const fileName = (r.fileUrl || '').split('/').pop() || 'receipt'
  return {
    id: r.id,
    expenseId: r.expenseId,
    fileName,
    fileUrl: r.fileUrl,
    uploadedAt: r.uploadedAt,
    verified: !!r.verified,
  }
}
