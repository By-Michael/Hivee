import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import api, { endpoints } from '../lib/api'
import { useAuth } from './AuthContext'
import {
  residentToUI, residentToCreateAPI, residentToUpdateAPI, missingPaymentToUI,
  feeToUI, feeToAPI,
  paymentToUI, paymentToCreateAPI, paymentToUpdateAPI,
  fundToUI, fundToAPI,
  projectToUI, projectToAPI,
  expenseToUI, expenseToAPI,
  receiptToUI,
  communityToUI, communityToUpdateAPI,
  pendingChangeToUI,
  setMeta,
} from '../lib/adapters'

const EMPTY_DATA = {
  community: { name: '', address: '', units: 0 },
  residents: [],
  fees: [],
  payments: [],
  funds: [],
  projects: [],
  expenses: [],
  receipts: [],
  pendingChanges: { asApprover: [], asProposer: [] },
}

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { user, bootstrapped } = useAuth()
  const [data, setData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  // True once the first fetch (success or failure) after a login has
  // finished. Lets the UI distinguish "still waiting on the very first
  // load" (show a skeleton) from "a background/action refresh is in
  // flight" (keep showing the page — see AppLayout).
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  // Fetches everything the logged-in user's role is allowed to see,
  // straight from the real Express + PostgreSQL API, whenever the user
  // changes (login, logout, token refresh).
  const refresh = useCallback(async (opts = {}) => {
    if (!user) return
    // Background/silent refreshes (auto-poll, tab refocus) skip the
    // loading flag so they never flash a spinner over content the user
    // is already looking at.
    if (!opts.silent) setLoading(true)
    setLoadError('')
    try {
      const isAdmin = user.rawRole === 'ADMIN' || user.rawRole === 'SUPER_ADMIN'

      // Everything the page needs is fetched in ONE parallel batch so the
      // total wait is the slowest single request, not the sum of all of
      // them. Previously the residents call ran *after* this batch
      // (adding a full extra round trip) and each fund's summary was
      // fetched one-by-one (an N+1 that scaled with fund count) — both
      // are why data used to "pop in" late after everything else.
      // Every one of these is independently guarded with .catch(). Previously
      // only 3 of the 8 calls here were guarded — if ANY of the unguarded
      // ones failed (e.g. payments returning a 500/400 from a schema
      // mismatch), Promise.all rejected as a whole and setData() below never
      // ran at all, silently wiping every panel back to empty (including
      // ones, like residents, whose own request had actually succeeded).
      // A failure in one section should never blank out the rest of the app.
      const label = (name) => (err) => {
        console.error(`[DataContext] Failed to load "${name}":`, err?.response?.data || err.message)
        return { __failed: name, error: err }
      }

      const [
        feesRes, fundsRes, projectsRes, expensesRes, paymentsRes, communityRes, residentsRes, fundSummariesRes, pendingChangesRes,
      ] = await Promise.all([
        api.get(endpoints.fees()).catch(label('fees')),
        api.get(endpoints.funds()).catch(label('funds')),
        api.get(endpoints.projects()).catch(label('projects')),
        api.get(endpoints.expenses()).catch(label('expenses')),
        api.get(endpoints.payments()).catch(label('payments')),
        // Every logged-in user (admin or resident) needs to read the
        // community's payment account details — residents to see where to
        // send money, admins to edit it — so this is fetched for both.
        api.get(endpoints.communityMe()).catch(label('community')),
        // Residents: admins list the whole community; residents only get
        // their own profile (list endpoint is admin-only on the backend).
        (isAdmin ? api.get(endpoints.residents()) : api.get('/residents/me')).catch(label('residents')),
        // Fund balances are derived (allocated vs. spent). A single bulk
        // endpoint replaces the old per-fund summary request.
        api.get(endpoints.fundSummaries()).catch(label('fundSummaries')),
        // Sensitive-change approval items (e.g. pending bank-detail change
        // requests) — ADMIN-only on the backend, so residents skip this
        // call entirely rather than hit an authorize() 403 every refresh.
        (isAdmin ? api.get(endpoints.pendingChangesMine()) : Promise.resolve({ data: { data: { asApprover: [], asProposer: [] } } })).catch(label('pendingChanges')),
      ])

      const failed = [feesRes, fundsRes, projectsRes, expensesRes, paymentsRes, residentsRes]
        .filter((r) => r?.__failed)
        .map((r) => r.__failed)

      const residentsRaw = residentsRes?.__failed
        ? []
        : isAdmin
          ? (residentsRes?.data?.data || [])
          : (residentsRes?.data?.data ? [residentsRes.data.data] : [])

      const fundsRaw = fundsRes?.__failed ? [] : fundsRes.data.data
      const summariesById = new Map((fundSummariesRes?.data?.data || []).map((s) => [s.fundId, s]))

      const expensesRaw = expensesRes?.__failed ? [] : expensesRes.data.data
      const receiptsFlat = expensesRaw.flatMap((e) => (e.receipts || []).map(receiptToUI))

      const communityRaw = communityRes?.__failed ? null : communityRes?.data?.data
      const pendingChangesRaw = pendingChangesRes?.__failed ? { asApprover: [], asProposer: [] } : (pendingChangesRes?.data?.data || { asApprover: [], asProposer: [] })
      setData({
        community: communityRaw ? communityToUI(communityRaw) : { name: user.community, address: '', paymentBankName: '', paymentAccountName: '', paymentAccountNumber: '' },
        residents: residentsRaw.map(residentToUI),
        fees: feesRes?.__failed ? [] : feesRes.data.data.map(feeToUI),
        payments: paymentsRes?.__failed ? [] : paymentsRes.data.data.map(paymentToUI),
        funds: fundsRaw.map((f) => fundToUI(f, summariesById.get(f.id) || null)),
        projects: projectsRes?.__failed ? [] : projectsRes.data.data.map(projectToUI),
        expenses: expensesRaw.map(expenseToUI),
        receipts: receiptsFlat,
        pendingChanges: {
          asApprover: (pendingChangesRaw.asApprover || []).map(pendingChangeToUI),
          asProposer: (pendingChangesRaw.asProposer || []).map(pendingChangeToUI),
        },
      })

      // Surface a visible (but non-fatal) warning if part of the dashboard
      // couldn't load, instead of failing silently or nuking everything.
      if (failed.length && !opts.silent) {
        setLoadError(`Some data failed to load (${failed.join(', ')}). Showing what did load — check the console for details.`)
      }
    } catch (err) {
      if (!opts.silent) setLoadError(err?.response?.data?.message || err.message || 'Failed to load data from the server.')
    } finally {
      if (!opts.silent) setLoading(false)
      if (!opts.silent) setHasLoadedOnce(true)
    }
  }, [user])

  useEffect(() => {
    if (bootstrapped && user) refresh()
    if (!user) { setData(EMPTY_DATA); setHasLoadedOnce(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bootstrapped])

  // Keep the dashboard feeling "alive": silently re-sync with the server
  // periodically so balances, new payments, etc. show up without a manual
  // refresh. Silent = no loading spinner, so it never interrupts typing.
  // Kept fairly infrequent (and de-duped against focus events below)
  // because each refresh fans out into many parallel API calls.
  useEffect(() => {
    if (!user) return
    let lastRun = Date.now()
    const t = setInterval(() => { lastRun = Date.now(); refresh({ silent: true }) }, 60000)
    // Also refresh when the tab regains focus/visibility — catches
    // changes made elsewhere while the user was away. Skipped if the
    // interval already refreshed recently, to avoid a duplicate burst
    // of requests right after the timer fires.
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastRun > 15000) {
        lastRun = Date.now()
        refresh({ silent: true })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [user, refresh])

  // Actions call the real API, then re-sync in the background so the UI
  // reflects what's actually persisted. Previously every action AWAITED
  // the full refresh() (8 parallel endpoints) before resolving, so every
  // "Save"/"Add" button across the whole site sat there for the entire
  // refetch before the modal closed — slow, and with no feedback in the
  // meantime it looked like nothing had happened. The actual write is
  // what the caller needs to wait on; re-syncing the rest of the app's
  // data can happen right after, without blocking the UI on it.
  const actions = useMemo(() => ({
    // ---- residents (ADMIN only on the backend) ----
    addResident: async (form) => {
      const { data: created } = await api.post(endpoints.residents(), residentToCreateAPI(form))
      refresh({ silent: true })
      return created.data.resident?.id
    },
    updateResident: async (id, patch) => {
      await api.patch(endpoints.resident(id), residentToUpdateAPI(patch))
      refresh({ silent: true })
    },
    removeResident: async (id) => {
      await api.delete(endpoints.resident(id))
      refresh({ silent: true })
    },
    // Full detail for the admin's resident-info popup: profile fields plus
    // every fee this resident is missing a payment for.
    fetchResidentSummary: async (id) => {
      const { data } = await api.get(endpoints.residentSummary(id))
      return {
        resident: residentToUI(data.data.resident),
        missingPayments: (data.data.missingPayments || []).map(missingPaymentToUI),
      }
    },

    // ---- system audit log (read-only: every committee member can view) ----
    fetchAuditLogs: async (params) => {
      const { data } = await api.get(endpoints.auditLogs(), { params })
      return data.data
    },

    // ---- fees ----
    addFee: async (form) => {
      await api.post(endpoints.fees(), feeToAPI(form))
      refresh({ silent: true })
    },
    updateFee: async (id, patch) => {
      await api.patch(endpoints.fee(id), feeToAPI(patch))
      refresh({ silent: true })
    },
    removeFee: async (id) => {
      await api.delete(endpoints.fee(id))
      refresh({ silent: true })
    },

    // ---- payments ----
    // A committee member recording a payment (cash-in-hand, no bank access,
    // etc.) has, by definition, already received the money — the backend
    // marks it VERIFIED straight away, so there's no separate follow-up
    // status call needed here any more. If a receipt file was attached in
    // the form, it's uploaded as a second call once the payment exists.
    addPayment: async (form) => {
      const { data: created } = await api.post(endpoints.payments(), paymentToCreateAPI(form))
      if (form.receiptFile) {
        const body = new FormData()
        body.append('receipt', form.receiptFile)
        await api.post(endpoints.paymentReceipt(created.data.id), body, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      refresh({ silent: true })
      return created.data.id
    },
    // Verify/reject a pending payment (unchanged behaviour).
    updatePayment: async (id, patch) => {
      if (patch.status) {
        const map = { paid: 'VERIFIED', pending: 'PENDING', overdue: 'REJECTED', rejected: 'REJECTED' }
        await api.patch(`${endpoints.payment(id)}/status`, { status: map[patch.status] || 'PENDING' })
      }
      refresh({ silent: true })
    },
    // Edit a manually-recorded payment. The backend rejects this for a
    // resident's own self-verified (bank) payment — see paymentController.js.
    editPayment: async (id, form) => {
      await api.patch(endpoints.payment(id), paymentToUpdateAPI(form))
      if (form.receiptFile) {
        const body = new FormData()
        body.append('receipt', form.receiptFile)
        await api.post(endpoints.paymentReceipt(id), body, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      refresh({ silent: true })
    },
    // Delete a manually-recorded payment. Same recordedBy restriction as
    // editPayment — a resident's bank-verified payment can never be
    // deleted here, only rejected via updatePayment/status.
    removePayment: async (id) => {
      await api.delete(endpoints.payment(id))
      refresh({ silent: true })
    },
    // Resident self-serve flow: submit a bank txn ID and get verified
    // against the bank instantly (no admin step). Throws on mismatch/
    // failure so the caller can show the error inline and let them retry.
    submitSelfPayment: async ({ feeId, txnId, payerName, reason, amount }) => {
      const { data } = await api.post(endpoints.paymentSelfVerify(), { feeId, txnId, payerName, reason, amount })
      refresh({ silent: true })
      return paymentToUI(data.data)
    },
    // Best-effort autofill from a payment screenshot — never trusted
    // directly, just prefills the form for the resident to confirm/edit.
    parsePaymentScreenshot: async (file) => {
      const body = new FormData()
      body.append('screenshot', file)
      const { data } = await api.post(endpoints.paymentParseScreenshot(), body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data.data
    },

    // ---- community settings (ADMIN only on the backend) ----
    // Bank-detail fields go through committee approval on the backend (see
    // communityController.updateMyCommunity) — this may return a
    // `pendingChange` instead of applying immediately. Returns the raw
    // response body so the caller (Settings page) can show the right
    // "applied" vs "awaiting approval" message.
    updateCommunity: async (form) => {
      const { data } = await api.patch(endpoints.communityMe(), communityToUpdateAPI(form))
      refresh({ silent: true })
      return data
    },

    // ---- generalized sensitive-change approval ----
    fetchMyPendingChanges: async () => {
      const { data } = await api.get(endpoints.pendingChangesMine())
      return {
        asApprover: (data.data.asApprover || []).map(pendingChangeToUI),
        asProposer: (data.data.asProposer || []).map(pendingChangeToUI),
      }
    },
    respondToPendingChange: async (id, decision) => {
      const { data } = await api.patch(endpoints.pendingChangeRespond(id), { decision })
      refresh({ silent: true })
      return pendingChangeToUI(data.data)
    },
    cancelPendingChange: async (id) => {
      await api.delete(endpoints.pendingChange(id))
    },

    // ---- funds ----
    addFund: async (form) => {
      const { data: created } = await api.post(endpoints.funds(), fundToAPI(form))
      refresh({ silent: true })
      return created.data.id
    },
    updateFund: async (id, patch) => {
      await api.patch(endpoints.fund(id), fundToAPI(patch))
      refresh({ silent: true })
    },
    removeFund: async (id) => {
      await api.delete(endpoints.fund(id))
      refresh({ silent: true })
    },

    // ---- projects ----
    addProject: async (form) => {
      await api.post(endpoints.projects(), projectToAPI(form))
      refresh({ silent: true })
    },
    // Name/description/dates/status apply instantly. Budget only applies
    // instantly if the project has no expenses logged yet — otherwise the
    // backend routes it through committee approval and returns
    // `budgetChangeMessage` explaining what happened instead of applying it.
    updateProject: async (id, patch) => {
      const { data } = await api.patch(endpoints.project(id), projectToAPI(patch))
      refresh({ silent: true })
      return data
    },
    // Blocked by the backend once the project has any expenses logged —
    // surfaces as a 403 with an explanatory message.
    removeProject: async (id) => {
      await api.delete(endpoints.project(id))
      refresh({ silent: true })
    },

    // ---- expenses ----
    addExpense: async (form) => {
      const { data: created } = await api.post(endpoints.expenses(), expenseToAPI(form))
      if (form.file) {
        const body = new FormData()
        body.append('expenseId', created.data.id)
        body.append('receipt', form.file)
        await api.post('/expenses/receipts', body, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      refresh({ silent: true })
      return created.data.id
    },
    // Expenses have no general edit — corrections are made by reversing
    // the original (a new, linked, offsetting Expense) and, if needed,
    // logging a fresh correct one. Both stay visible in the trail.
    reverseExpense: async (id, reason) => {
      const { data } = await api.post(endpoints.reverseExpense(id), reason ? { reason } : {})
      refresh({ silent: true })
      return data.data
    },
    // Narrow exception only: the backend enforces a short grace window,
    // original-recorder-only, and no-receipts-attached — this call can
    // still fail with a 403 explaining why even though the button is shown.
    removeExpense: async (id) => {
      await api.delete(endpoints.expense(id))
      refresh({ silent: true })
    },

    // ---- receipts ----
    // form.file (a real File object) is required — receipts are always a
    // genuine upload against the backend, never a display-only stand-in.
    addReceipt: async (form) => {
      if (!form.file) throw new Error('Choose a file to upload.')
      const body = new FormData()
      body.append('expenseId', form.expenseId)
      body.append('receipt', form.file)
      await api.post('/expenses/receipts', body, { headers: { 'Content-Type': 'multipart/form-data' } })
      refresh({ silent: true })
    },
    updateReceipt: async (id, patch) => {
      // SCHEMA GAP: "verified" isn't a real column — stored client-side.
      if (typeof patch.verified === 'boolean') setMeta('receiptVerified', id, patch.verified)
      refresh({ silent: true })
    },
    removeReceipt: async (id) => {
      await api.delete(endpoints.receipt(id))
      refresh({ silent: true })
    },

    refreshAll: () => refresh(),

    // ---- committee seat transfer ----
    fetchMyTransferItems: async () => {
      const { data } = await api.get(endpoints.committeeTransferMine())
      return data.data // { asApprover, asRecipient, asRequester }
    },
    requestCommitteeTransfer: async (toResidentId) => {
      const { data } = await api.post(endpoints.committeeTransfers(), { toResidentId })
      return data.data
    },
    respondAsCommitteeMember: async (id, decision) => {
      const { data } = await api.patch(endpoints.committeeTransferCommitteeResponse(id), { decision })
      refresh({ silent: true })
      return data.data
    },
    respondAsTransferRecipient: async (id, decision) => {
      const { data } = await api.patch(endpoints.committeeTransferRecipientResponse(id), { decision })
      refresh({ silent: true })
      return data.data
    },
    cancelCommitteeTransfer: async (id) => {
      await api.delete(endpoints.committeeTransfer(id))
    },
  }), [refresh])

  return <DataContext.Provider value={{ ...data, ...actions, loading, loadError, hasLoadedOnce, refresh }}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
