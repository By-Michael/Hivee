import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
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
  // True counts from the server, independent of how many resident rows are
  // actually loaded (see residentsMeta below) — the "N registered / N
  // active" header stays correct even when the full list isn't in memory.
  residentsMeta: { total: 0, activeTotal: 0, page: 1, totalPages: 1, limit: 200 },
  fees: [],
  payments: [],
  funds: [],
  projects: [],
  expenses: [],
  receipts: [],
  pendingChanges: { asApprover: [], asProposer: [] },
}

// Generic pager for the (now paginated) payments/expenses endpoints — pages
// through in bounded chunks (using the existing communityId/date indexes)
// until everything's loaded, once per login/refresh rather than per click.
async function fetchAllPages(url, extraParams) {
  const limit = 500
  let page = 1
  let all = []
  for (let i = 0; i < 200; i++) {
    const { data } = await api.get(url, { params: { page, limit, ...extraParams } })
    all = all.concat(data.data || [])
    if (!data.meta || page >= data.meta.totalPages) break
    page += 1
  }
  return all
}

// Fetches just ONE page of a paginated list endpoint — used for the fast
// first paint (see FIRST_PAINT_LIMIT below) so the very first thing the
// user sees after login doesn't wait on the whole table.
async function fetchFirstPage(url, limit, extraParams) {
  const { data } = await api.get(url, { params: { page: 1, limit, ...extraParams } })
  return { items: data.data || [], meta: data.meta || null }
}

const DataContext = createContext(null)

// How many rows of a big list (residents/payments/expenses) to fetch
// synchronously as part of the blocking "first paint" load. Small enough
// to be fast even for communities with thousands of rows; the rest is
// paged in afterwards, silently, in the background (see loadRestInBackground
// in DataProvider below).
const FIRST_PAINT_LIMIT = 200

// Pages through the (now paginated) residents endpoint until every resident
// has been fetched. Still bounded per-request (protects the server/browser
// from one multi-thousand-row response). Used only for the silent
// background pass and for explicit "load everything" calls — not for the
// initial blocking load any more, so a community with thousands of
// residents doesn't make the user stare at a skeleton while 5,000 rows page
// in one request at a time.
async function fetchAllResidents() {
  const limit = 500
  let page = 1
  let all = []
  let meta = { total: 0, activeTotal: 0 }
  // Safety cap: even if something's wrong with the pagination response,
  // never loop more than 100 pages (50,000 residents) here.
  for (let i = 0; i < 100; i++) {
    const { data } = await api.get(endpoints.residents(), { params: { page, limit } })
    all = all.concat(data.data || [])
    meta = data.meta || meta
    if (!data.meta || page >= data.meta.totalPages) break
    page += 1
  }
  return { residents: all, meta }
}

// Merges a freshly-fetched batch of rows into an already-cached list by id:
// existing rows are updated in place (so edits made elsewhere show up),
// rows not present in the batch are left untouched (so a full list that was
// already paged in via the background load isn't truncated back down to
// just the batch), and brand-new rows are added to the front. This is what
// lets silent background/interval refreshes stay cheap (fetch one page)
// without ever discarding data the app already has cached in memory.
function mergeById(existing, batch) {
  if (!batch.length) return existing
  const byId = new Map(batch.map((item) => [item.id, item]))
  const merged = existing.map((item) => byId.get(item.id) || item)
  const existingIds = new Set(existing.map((item) => item.id))
  const fresh = batch.filter((item) => !existingIds.has(item.id))
  return [...fresh, ...merged]
}

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
  // True while the post-first-paint background pass (paging in the rest of
  // residents/payments/expenses beyond FIRST_PAINT_LIMIT) is running.
  // Exposed in case a page wants a tiny "still syncing…" hint, but nothing
  // in the UI is blocked on it.
  const [backgroundLoading, setBackgroundLoading] = useState(false)
  // Tracks, per login session, whether each big list has already been
  // paged in fully — so the periodic silent refresh (every 60s / on tab
  // focus) never re-pages thousands of rows from scratch. It only ever
  // re-fetches the first page and merges it in (see mergeById), and only
  // (re)kicks off the full background page-in once, right after login.
  const [fullyLoaded, setFullyLoaded] = useState({ residents: false, payments: false, expenses: false })
  // True once payments/expenses (and, for admins, residents) have been
  // paged in completely — i.e. once anything that computes totals or
  // charts from the full dataset can trust what it sees. Pages/lists can
  // render progressively as data streams in, but analytics/diagrams should
  // wait for this before summing or charting, or they'll show numbers that
  // quietly change/jump once the background load finishes.
  const dataFullyLoaded = fullyLoaded.residents && fullyLoaded.payments && fullyLoaded.expenses
  // Guards against kicking off a second background page-in pass while one
  // is already running (e.g. a focus event firing mid-load).
  const bgInFlight = useRef(false)

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
      const isAdmin = user.rawRole === 'ADMIN'

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

      // "First paint" phase: only the first FIRST_PAINT_LIMIT rows of each
      // big list (residents/payments/expenses) are fetched here, so this
      // Promise.all resolves quickly even for a community with thousands
      // of rows — the skeleton clears fast and the user sees real data.
      // Everything else (fees/funds/projects/community/fund
      // summaries/pending changes) is already small, so it's fetched in
      // full as before.
      //
      // On a *silent* background/interval refresh we skip re-paging the
      // big lists altogether if they're already fully loaded — we only
      // pull page 1 (to pick up edits/new rows) and merge it into the
      // cached list (see mergeById), instead of re-downloading everything
      // on every 60s tick / tab focus.
      const skipBigListPage1 = opts.silent && fullyLoaded.residents && fullyLoaded.payments && fullyLoaded.expenses

      const [
        feesRes, fundsRes, projectsRes, expensesRes, paymentsRes, communityRes, residentsRes, fundSummariesRes, pendingChangesRes,
      ] = await Promise.all([
        api.get(endpoints.fees()).catch(label('fees')),
        api.get(endpoints.funds()).catch(label('funds')),
        api.get(endpoints.projects()).catch(label('projects')),
        skipBigListPage1
          ? Promise.resolve(null)
          : fetchFirstPage(endpoints.expenses(), FIRST_PAINT_LIMIT).catch(label('expenses')),
        skipBigListPage1
          ? Promise.resolve(null)
          : fetchFirstPage(endpoints.payments(), FIRST_PAINT_LIMIT).catch(label('payments')),
        // Every logged-in user (admin or resident) needs to read the
        // community's payment account details — residents to see where to
        // send money, admins to edit it — so this is fetched for both.
        api.get(endpoints.communityMe()).catch(label('community')),
        // Residents: admins get the first page only here (fast); the rest
        // is paged in afterwards, silently, by loadRestInBackground below.
        // Residents only get their own profile (list endpoint is
        // admin-only on the backend).
        (skipBigListPage1
          ? Promise.resolve(null)
          : (isAdmin ? fetchFirstPage(endpoints.residents(), FIRST_PAINT_LIMIT) : api.get('/residents/me'))
        ).catch(label('residents')),
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

      const fundsRaw = fundsRes?.__failed ? [] : fundsRes.data.data
      const summariesById = new Map((fundSummariesRes?.data?.data || []).map((s) => [s.fundId, s]))
      const communityRaw = communityRes?.__failed ? null : communityRes?.data?.data
      const pendingChangesRaw = pendingChangesRes?.__failed ? { asApprover: [], asProposer: [] } : (pendingChangesRes?.data?.data || { asApprover: [], asProposer: [] })

      setData((prev) => {
        // If we skipped the big-list page-1 fetch (already fully loaded,
        // silent refresh), keep the cached lists exactly as they are —
        // nothing to merge.
        const residentsUI = residentsRes === null
          ? prev.residents
          : (residentsRes?.__failed
            ? prev.residents
            : isAdmin
              ? (residentsRes?.items || []).map(residentToUI)
              : (residentsRes?.data?.data ? [residentToUI(residentsRes.data.data)] : []))
        const residentsMeta = residentsRes === null
          ? prev.residentsMeta
          : (isAdmin && !residentsRes?.__failed && residentsRes?.meta)
            ? residentsRes.meta
            : { total: residentsUI.length, activeTotal: residentsUI.filter((r) => r.status === 'active').length, page: 1, totalPages: 1, limit: residentsUI.length || FIRST_PAINT_LIMIT }

        const paymentsUI = paymentsRes === null
          ? prev.payments
          : (paymentsRes?.__failed ? prev.payments : (paymentsRes.items || []).map(paymentToUI))
        const expensesUI = expensesRes === null
          ? prev.expenses
          : (expensesRes?.__failed ? prev.expenses : (expensesRes.items || []).map(expenseToUI))

        const isFirstLoad = !opts.silent
        return {
          community: communityRaw ? communityToUI(communityRaw) : (prev.community.name ? prev.community : { name: user.community, address: '', paymentBankName: '', paymentAccountName: '', paymentAccountNumber: '' }),
          // On first load, use the fetched page straight away. On a silent
          // refresh, merge the fresh page into whatever's cached (which
          // may already be the FULL list from the background pass) so we
          // never truncate data we've already paged in.
          residents: isFirstLoad || residentsRes === null ? residentsUI : mergeById(prev.residents, residentsUI),
          residentsMeta,
          fees: feesRes?.__failed ? prev.fees : feesRes.data.data.map(feeToUI),
          payments: isFirstLoad || paymentsRes === null ? paymentsUI : mergeById(prev.payments, paymentsUI),
          funds: fundsRes?.__failed ? prev.funds : fundsRaw.map((f) => fundToUI(f, summariesById.get(f.id) || null)),
          projects: projectsRes?.__failed ? prev.projects : projectsRes.data.data.map(projectToUI),
          expenses: isFirstLoad || expensesRes === null ? expensesUI : mergeById(prev.expenses, expensesUI),
          receipts: (isFirstLoad || expensesRes === null ? expensesUI : mergeById(prev.expenses, expensesUI)).flatMap((e) => (e.receipts || []).map(receiptToUI)),
          pendingChanges: {
            asApprover: (pendingChangesRaw.asApprover || []).map(pendingChangeToUI),
            asProposer: (pendingChangesRaw.asProposer || []).map(pendingChangeToUI),
          },
        }
      })

      // Surface a visible (but non-fatal) warning if part of the dashboard
      // couldn't load, instead of failing silently or nuking everything.
      if (failed.length && !opts.silent) {
        setLoadError(`Some data failed to load (${failed.join(', ')}). Showing what did load — check the console for details.`)
      }

      // Kick off the silent background pass exactly once per login: pages
      // in the rest of residents/payments/expenses beyond FIRST_PAINT_LIMIT
      // without blocking or re-showing the skeleton. Skipped entirely for
      // small communities where the first page already had everything.
      if (!opts.silent && !bgInFlight.current) {
        loadRestInBackground(isAdmin)
      }
    } catch (err) {
      if (!opts.silent) setLoadError(err?.response?.data?.message || err.message || 'Failed to load data from the server.')
    } finally {
      if (!opts.silent) setLoading(false)
      if (!opts.silent) setHasLoadedOnce(true)
    }
  }, [user, fullyLoaded])

  // Silently pages in whatever didn't fit in the first paint (residents
  // beyond 200, payments/expenses beyond 200), then replaces the cached
  // list with the complete, authoritative set in one go. Runs in the
  // background — the user can already see and use the app while this is
  // happening. Marks each list "fully loaded" so future silent refreshes
  // stop re-paging it (see fullyLoaded / skipBigListPage1 above).
  const loadRestInBackground = useCallback(async (isAdmin) => {
    bgInFlight.current = true
    setBackgroundLoading(true)
    try {
      const jobs = []
      if (isAdmin) {
        jobs.push(
          fetchAllResidents()
            .then(({ residents, meta }) => {
              setData((d) => ({ ...d, residents: residents.map(residentToUI), residentsMeta: meta }))
              setFullyLoaded((f) => ({ ...f, residents: true }))
            })
            .catch((err) => console.error('[DataContext] Background residents load failed:', err?.response?.data || err.message))
        )
      } else {
        setFullyLoaded((f) => ({ ...f, residents: true }))
      }
      jobs.push(
        fetchAllPages(endpoints.payments())
          .then((all) => {
            setData((d) => ({ ...d, payments: all.map(paymentToUI) }))
            setFullyLoaded((f) => ({ ...f, payments: true }))
          })
          .catch((err) => console.error('[DataContext] Background payments load failed:', err?.response?.data || err.message))
      )
      jobs.push(
        fetchAllPages(endpoints.expenses())
          .then((all) => {
            setData((d) => ({ ...d, expenses: all.map(expenseToUI), receipts: all.flatMap((e) => (e.receipts || []).map(receiptToUI)) }))
            setFullyLoaded((f) => ({ ...f, expenses: true }))
          })
          .catch((err) => console.error('[DataContext] Background expenses load failed:', err?.response?.data || err.message))
      )
      await Promise.all(jobs)
    } finally {
      bgInFlight.current = false
      setBackgroundLoading(false)
    }
  }, [])

  useEffect(() => {
    if (bootstrapped && user) refresh()
    if (!user) {
      setData(EMPTY_DATA)
      setHasLoadedOnce(false)
      // Reset the "already fully loaded" bookkeeping so the next login
      // (possibly a different user/community) does its own fresh
      // first-paint + background-page-in cycle instead of assuming
      // yesterday's session's big lists are still complete.
      setFullyLoaded({ residents: false, payments: false, expenses: false })
      bgInFlight.current = false
    }
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

  // Actions call the real API and patch local state directly from the
  // response instead of re-fetching everything. Previously every single
  // action here — including a plain resident delete — fired a full
  // refresh() that re-ran all ~9 list endpoints (residents, payments,
  // funds, projects, expenses, fees, community, fund summaries, pending
  // changes) unconditionally. With a community seeded to thousands of
  // rows, that meant clicking Delete on ONE resident re-downloaded and
  // re-rendered the entire dataset before the row visibly disappeared —
  // which is why every Save/Delete button felt as slow as the initial
  // page load. Now the visible list updates immediately from the API's
  // own response, and only a couple of actions that ripple into numbers
  // they don't return directly (e.g. a payment changing a fund's balance)
  // still trigger a background, non-blocking refresh to reconcile those.
  const patchList = (key) => (updater) => setData((d) => ({ ...d, [key]: updater(d[key]) }))

  const actions = useMemo(() => ({
    // ---- residents (ADMIN only on the backend) ----
    addResident: async (form) => {
      const { data: created } = await api.post(endpoints.residents(), residentToCreateAPI(form))
      const resident = created.data.resident
        ? residentToUI({ ...created.data.resident, user: { id: created.data.id, fullName: created.data.fullName, email: created.data.email, role: created.data.role } })
        : null
      if (resident) {
        setData((d) => ({
          ...d,
          residents: [resident, ...d.residents],
          residentsMeta: { ...d.residentsMeta, total: d.residentsMeta.total + 1, activeTotal: d.residentsMeta.activeTotal + (resident.status === 'active' ? 1 : 0) },
        }))
      } else {
        refresh({ silent: true })
      }
      return created.data.resident?.id
    },
    updateResident: async (id, patch) => {
      const { data } = await api.patch(endpoints.resident(id), residentToUpdateAPI(patch))
      const updated = residentToUI(data.data)
      patchList('residents')((list) => list.map((r) => (r.id === id ? updated : r)))
    },
    removeResident: async (id) => {
      await api.delete(endpoints.resident(id))
      setData((d) => {
        const removed = d.residents.find((r) => r.id === id)
        return {
          ...d,
          residents: d.residents.filter((r) => r.id !== id),
          residentsMeta: {
            ...d.residentsMeta,
            total: Math.max(0, d.residentsMeta.total - 1),
            activeTotal: Math.max(0, d.residentsMeta.activeTotal - (removed?.status === 'active' ? 1 : 0)),
          },
        }
      })
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
      const { data } = await api.post(endpoints.fees(), feeToAPI(form))
      patchList('fees')((list) => [feeToUI(data.data), ...list])
    },
    updateFee: async (id, patch) => {
      const { data } = await api.patch(endpoints.fee(id), feeToAPI(patch))
      patchList('fees')((list) => list.map((f) => (f.id === id ? feeToUI(data.data) : f)))
    },
    removeFee: async (id) => {
      await api.delete(endpoints.fee(id))
      patchList('fees')((list) => list.filter((f) => f.id !== id))
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
      patchList('payments')((list) => [paymentToUI(created.data), ...list])
      // A payment can move a fund's real cash balance — that figure lives
      // in fund summaries, not on the payment itself, so reconcile it in
      // the background. The payment row above is already visible, so this
      // doesn't block or delay anything the user sees.
      refresh({ silent: true })
      return created.data.id
    },
    // Verify/reject a pending payment (unchanged behaviour).
    updatePayment: async (id, patch) => {
      if (patch.status) {
        const map = { paid: 'VERIFIED', pending: 'PENDING', overdue: 'REJECTED', rejected: 'REJECTED' }
        const { data } = await api.patch(`${endpoints.payment(id)}/status`, { status: map[patch.status] || 'PENDING' })
        patchList('payments')((list) => list.map((p) => (p.id === id ? paymentToUI(data.data) : p)))
      }
      refresh({ silent: true })
    },
    // Edit a manually-recorded payment. The backend rejects this for a
    // resident's own self-verified (bank) payment — see paymentController.js.
    editPayment: async (id, form) => {
      const { data } = await api.patch(endpoints.payment(id), paymentToUpdateAPI(form))
      if (form.receiptFile) {
        const body = new FormData()
        body.append('receipt', form.receiptFile)
        await api.post(endpoints.paymentReceipt(id), body, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      patchList('payments')((list) => list.map((p) => (p.id === id ? paymentToUI(data.data) : p)))
      refresh({ silent: true })
    },
    // Delete a manually-recorded payment. Same recordedBy restriction as
    // editPayment — a resident's bank-verified payment can never be
    // deleted here, only rejected via updatePayment/status.
    removePayment: async (id) => {
      await api.delete(endpoints.payment(id))
      patchList('payments')((list) => list.filter((p) => p.id !== id))
      refresh({ silent: true })
    },
    // Resident self-serve flow: submit a bank txn ID and get verified
    // against the bank instantly (no admin step). Throws on mismatch/
    // failure so the caller can show the error inline and let them retry.
    submitSelfPayment: async ({ feeId, fundId, txnId, payerName, reason, amount }) => {
      const { data } = await api.post(endpoints.paymentSelfVerify(), { feeId, fundId, txnId, payerName, reason, amount })
      patchList('payments')((list) => [paymentToUI(data.data), ...list])
      refresh({ silent: true })
      return paymentToUI(data.data)
    },
    // Resident retracting their own still-pending self-verified payment
    // (e.g. wrong txn ID / wrong fee). Backend only allows this while the
    // payment is PENDING_REVIEW — already-VERIFIED or admin-reviewed
    // payments will reject this with a clear error.
    retractPayment: async (id) => {
      await api.delete(endpoints.paymentRetract(id))
      patchList('payments')((list) => list.filter((p) => p.id !== id))
      refresh({ silent: true })
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
    // Funds carry a derived `balance`/`actualBalance` that only fund
    // summaries know how to compute, so a plain create/update response
    // can't fill that in locally — those two still lean on a background
    // refresh. Delete is a pure removal, so that one patches instantly.
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
      patchList('funds')((list) => list.filter((f) => f.id !== id))
    },

    // ---- projects ----
    addProject: async (form) => {
      const { data: created } = await api.post(endpoints.projects(), projectToAPI(form))
      patchList('projects')((list) => [projectToUI(created.data), ...list])
    },
    // Name/description/dates/status apply instantly. Budget only applies
    // instantly if the project has no expenses logged yet — otherwise the
    // backend routes it through committee approval and returns
    // `budgetChangeMessage` explaining what happened instead of applying it.
    updateProject: async (id, patch) => {
      const { data } = await api.patch(endpoints.project(id), projectToAPI(patch))
      patchList('projects')((list) => list.map((p) => (p.id === id ? projectToUI(data.data) : p)))
      return data
    },
    // Blocked by the backend once the project has any expenses logged —
    // surfaces as a 403 with an explanatory message.
    removeProject: async (id) => {
      await api.delete(endpoints.project(id))
      patchList('projects')((list) => list.filter((p) => p.id !== id))
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
      patchList('expenses')((list) => [expenseToUI(created.data), ...list])
      // Spending a fund's money changes its balance, which lives in fund
      // summaries — reconciled in the background, not blocking this call.
      refresh({ silent: true })
      return created.data.id
    },
    // Expenses have no general edit — corrections are made by reversing
    // the original (a new, linked, offsetting Expense) and, if needed,
    // logging a fresh correct one. Both stay visible in the trail.
    reverseExpense: async (id, reason) => {
      const { data } = await api.post(endpoints.reverseExpense(id), reason ? { reason } : {})
      patchList('expenses')((list) => [expenseToUI(data.data), ...list.map((e) => (e.id === id ? { ...e, isVoided: true } : e))])
      refresh({ silent: true })
      return data.data
    },
    // Narrow exception only: the backend enforces a short grace window,
    // original-recorder-only, and no-receipts-attached — this call can
    // still fail with a 403 explaining why even though the button is shown.
    removeExpense: async (id) => {
      await api.delete(endpoints.expense(id))
      patchList('expenses')((list) => list.filter((e) => e.id !== id))
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
      const { data } = await api.post('/expenses/receipts', body, { headers: { 'Content-Type': 'multipart/form-data' } })
      patchList('receipts')((list) => [receiptToUI(data.data), ...list])
    },
    updateReceipt: async (id, patch) => {
      // SCHEMA GAP: "verified" isn't a real column — stored client-side.
      if (typeof patch.verified === 'boolean') setMeta('receiptVerified', id, patch.verified)
      patchList('receipts')((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    },
    removeReceipt: async (id) => {
      await api.delete(endpoints.receipt(id))
      patchList('receipts')((list) => list.filter((r) => r.id !== id))
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

  return <DataContext.Provider value={{ ...data, ...actions, loading, loadError, hasLoadedOnce, backgroundLoading, dataFullyLoaded, refresh }}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
