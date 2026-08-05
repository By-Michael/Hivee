// -----------------------------------------------------------------------
// Adapter layer between the UI's simple data shapes (used by every page in
// src/pages/**) and the real CFMS backend's Prisma/REST contract.
//
// Why this file exists:
// The UI was originally built against a mock, denormalized data model
// (e.g. payment.status === 'paid', resident.unit, fund.balance). The real
// backend uses UUIDs, enums (PENDING/VERIFIED/REJECTED), and a normalized
// relational schema. Rather than rewrite every page (high risk, low value),
// this module translates cleanly in both directions so pages keep working
// unmodified while every read/write goes through the real API.
//
// A few UI fields have no column in the Prisma schema at all (resident
// phone number, fund "balance"/"category" as a single stored figure,
// receipt "verified" flag, receipt display file name). Those are called
// out below with SCHEMA GAP comments — see README "Known limitations" for
// the recommended follow-up migration.
// -----------------------------------------------------------------------

// ---- tiny localStorage-backed overlay for fields the schema can't hold ----
const META_KEY = 'cfms_client_meta_v1'

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) || {}
  } catch {
    return {}
  }
}
function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}
export function getMeta(bucket, id, fallback) {
  const meta = loadMeta()
  return meta?.[bucket]?.[id] ?? fallback
}
export function setMeta(bucket, id, value) {
  const meta = loadMeta()
  meta[bucket] = meta[bucket] || {}
  meta[bucket][id] = value
  saveMeta(meta)
}

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

const PAYMENT_STATUS_TO_UI = { PENDING: 'pending', VERIFIED: 'paid', REJECTED: 'rejected' }

const PROJECT_STATUS_TO_UI = { PLANNED: 'planned', ONGOING: 'in-progress', COMPLETED: 'completed', CANCELLED: 'cancelled' }
const PROJECT_STATUS_TO_API = { planned: 'PLANNED', 'in-progress': 'ONGOING', completed: 'COMPLETED', cancelled: 'CANCELLED' }

const FUND_CATEGORIES = ['Security', 'Utilities', 'Maintenance', 'Development']

// ------------------------------ residents -------------------------------
// SCHEMA GAP: phone isn't modeled on User/Resident. Kept in the local meta
// overlay, keyed by resident id, so the UI's phone field keeps working.
export function residentToUI(r) {
  return {
    id: r.id,
    name: r.user?.fullName ?? r.fullName ?? '',
    unit: r.unitNumber ?? '',
    phone: getMeta('residentPhone', r.id, ''),
    email: r.user?.email ?? r.email ?? '',
    status: RESIDENT_STATUS_TO_UI[r.status] || 'active',
    joined: r.joinedAt,
    userId: r.userId ?? r.user?.id,
  }
}

export function residentToCreateAPI(form) {
  return {
    fullName: form.name,
    email: form.email,
    password: form.password,
    unitNumber: form.unit,
    status: RESIDENT_STATUS_TO_API[form.status] || 'ACTIVE',
  }
}

export function residentToUpdateAPI(form) {
  return {
    fullName: form.name,
    unitNumber: form.unit,
    status: RESIDENT_STATUS_TO_API[form.status] || 'ACTIVE',
  }
}

// --------------------------------- fees ----------------------------------
export function feeToUI(f) {
  return {
    id: f.id,
    name: f.name,
    amount: Number(f.amount),
    frequency: FEE_FREQ_TO_UI[f.frequency] || 'monthly',
    category: f.description || 'Security',
  }
}

export function feeToAPI(form) {
  return {
    name: form.name,
    amount: Number(form.amount),
    frequency: FEE_FREQ_TO_API[form.frequency] || 'MONTHLY',
    description: form.category,
  }
}

// ------------------------------- payments ---------------------------------
export function paymentToUI(p) {
  return {
    id: p.id,
    residentId: p.residentId,
    feeId: p.feeId,
    amount: Number(p.amount),
    date: p.paidAt,
    method: PAYMENT_METHOD_TO_UI[p.paymentMethod] || 'Cash',
    status: PAYMENT_STATUS_TO_UI[p.status] || 'pending',
    reference: p.transactionReference || '',
  }
}

export function paymentToCreateAPI(form) {
  return {
    residentId: form.residentId || undefined,
    feeId: form.feeId,
    amount: Number(form.amount),
    paymentMethod: PAYMENT_METHOD_TO_API[form.method] || 'CASH',
    transactionReference: form.reference || undefined,
  }
}

// -------------------------------- funds -----------------------------------
// SCHEMA GAP: Fund has no numeric balance column — balances are derived
// (allocated vs. spent across a fund's projects/expenses). "category" is
// stored in Fund.description, which really is a free-text column.
export function fundToUI(f, summary) {
  return {
    id: f.id,
    name: f.name,
    category: FUND_CATEGORIES.includes(f.description) ? f.description : 'Security',
    balance: summary ? summary.remaining : 0,
    projectCount: f._count?.projects ?? 0,
  }
}

export function fundToAPI(form) {
  return {
    name: form.name,
    description: form.category,
  }
}

// ------------------------------- projects ----------------------------------
export function projectToUI(p) {
  return {
    id: p.id,
    name: p.name,
    fundId: p.fundId,
    budget: Number(p.budget),
    spent: (p.expenses || []).reduce((s, e) => s + Number(e.amount), 0),
    status: PROJECT_STATUS_TO_UI[p.status] || 'planned',
    startDate: p.startDate,
    endDate: p.endDate,
  }
}

export function projectToAPI(form) {
  return {
    fundId: form.fundId,
    name: form.name,
    budget: Number(form.budget),
    status: PROJECT_STATUS_TO_API[form.status] || 'PLANNED',
    startDate: form.startDate,
    endDate: form.endDate || undefined,
  }
}

// ------------------------------- expenses -----------------------------------
export function expenseToUI(e) {
  return {
    id: e.id,
    projectId: e.projectId,
    description: e.description || '',
    amount: Number(e.amount),
    vendor: e.vendor || '',
    date: e.spentAt,
    receiptId: e.receipts?.[0]?.id,
  }
}

export function expenseToAPI(form) {
  return {
    projectId: form.projectId || undefined,
    description: form.description,
    vendor: form.vendor,
    amount: Number(form.amount),
    spentAt: form.date || undefined,
  }
}

// ------------------------------- receipts -------------------------------------
// SCHEMA GAP: Receipt only stores { expenseId, fileUrl, uploadedAt } — no
// display file name (derived from fileUrl) and no verified flag (kept in
// the local meta overlay, keyed by receipt id).
export function receiptToUI(r) {
  const fileName = (r.fileUrl || '').split('/').pop() || 'receipt'
  return {
    id: r.id,
    expenseId: r.expenseId,
    fileName,
    fileUrl: r.fileUrl,
    uploadedAt: r.uploadedAt,
    verified: getMeta('receiptVerified', r.id, false),
  }
}
