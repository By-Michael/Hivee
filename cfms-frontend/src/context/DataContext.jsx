import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import api, { endpoints } from '../lib/api'
import { useAuth } from './AuthContext'
import {
  residentToUI, residentToCreateAPI, residentToUpdateAPI,
  feeToUI, feeToAPI,
  paymentToUI, paymentToCreateAPI,
  fundToUI, fundToAPI,
  projectToUI, projectToAPI,
  expenseToUI, expenseToAPI,
  receiptToUI,
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
}

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { user, bootstrapped } = useAuth()
  const [data, setData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  // Fetches everything the logged-in user's role is allowed to see,
  // straight from the real Express + PostgreSQL API, whenever the user
  // changes (login, logout, token refresh).
  const refresh = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setLoadError('')
    try {
      const isAdmin = user.rawRole === 'ADMIN' || user.rawRole === 'SUPER_ADMIN'

      const [feesRes, fundsRes, projectsRes, expensesRes, paymentsRes] = await Promise.all([
        api.get(endpoints.fees()),
        api.get(endpoints.funds()),
        api.get(endpoints.projects()),
        api.get(endpoints.expenses()),
        api.get(endpoints.payments()),
      ])

      // Residents: admins list the whole community; residents only get
      // their own profile (list endpoint is admin-only on the backend).
      let residentsRaw = []
      if (isAdmin) {
        const r = await api.get(endpoints.residents())
        residentsRaw = r.data.data
      } else {
        try {
          const r = await api.get('/residents/me')
          residentsRaw = r.data.data ? [r.data.data] : []
        } catch {
          residentsRaw = []
        }
      }

      // Fund balances are derived (allocated vs. spent), so fetch each
      // fund's summary in parallel rather than storing a balance column.
      const fundsRaw = fundsRes.data.data
      const summaries = await Promise.all(
        fundsRaw.map((f) => api.get(`${endpoints.fund(f.id)}/summary`).then((r) => r.data.data).catch(() => null))
      )

      const expensesRaw = expensesRes.data.data
      const receiptsFlat = expensesRaw.flatMap((e) => (e.receipts || []).map(receiptToUI))

      setData({
        community: { name: user.community, address: '', units: 0 },
        residents: residentsRaw.map(residentToUI),
        fees: feesRes.data.data.map(feeToUI),
        payments: paymentsRes.data.data.map(paymentToUI),
        funds: fundsRaw.map((f, i) => fundToUI(f, summaries[i])),
        projects: projectsRes.data.data.map(projectToUI),
        expenses: expensesRaw.map(expenseToUI),
        receipts: receiptsFlat,
      })
    } catch (err) {
      setLoadError(err?.response?.data?.message || err.message || 'Failed to load data from the server.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (bootstrapped && user) refresh()
    if (!user) setData(EMPTY_DATA)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bootstrapped])

  // Actions call the real API, then re-fetch the affected slice from the
  // server so the UI always reflects what's actually persisted.
  const actions = useMemo(() => ({
    // ---- residents (ADMIN only on the backend) ----
    addResident: async (form) => {
      const { data: created } = await api.post(endpoints.residents(), residentToCreateAPI(form))
      await refresh()
      return created.data.resident?.id
    },
    updateResident: async (id, patch) => {
      await api.patch(endpoints.resident(id), residentToUpdateAPI(patch))
      await refresh()
    },
    removeResident: async (id) => {
      await api.delete(endpoints.resident(id))
      await refresh()
    },

    // ---- fees ----
    addFee: async (form) => {
      await api.post(endpoints.fees(), feeToAPI(form))
      await refresh()
    },
    updateFee: async (id, patch) => {
      await api.patch(endpoints.fee(id), feeToAPI(patch))
      await refresh()
    },
    removeFee: async (id) => {
      await api.delete(endpoints.fee(id))
      await refresh()
    },

    // ---- payments ----
    // The backend always creates payments as PENDING and only lets an
    // ADMIN verify/reject them afterwards via a separate endpoint. The
    // UI's "Status" selector at creation time is honored by issuing that
    // follow-up call so the recorded outcome still matches what the
    // admin picked.
    addPayment: async (form) => {
      const { data: created } = await api.post(endpoints.payments(), paymentToCreateAPI(form))
      const wantStatus = form.status === 'paid' ? 'VERIFIED' : form.status === 'overdue' ? 'REJECTED' : null
      if (wantStatus) {
        await api.patch(`${endpoints.payment(created.data.id)}/status`, { status: wantStatus })
      }
      await refresh()
    },
    updatePayment: async (id, patch) => {
      if (patch.status) {
        const map = { paid: 'VERIFIED', pending: 'PENDING', overdue: 'REJECTED', rejected: 'REJECTED' }
        await api.patch(`${endpoints.payment(id)}/status`, { status: map[patch.status] || 'PENDING' })
      }
      await refresh()
    },
    removePayment: async () => {
      // The backend has no payment-delete endpoint by design (financial
      // records are append-only) — reject to VERIFIED/REJECTED instead.
      throw new Error('Payments cannot be deleted. Use verify/reject instead.')
    },

    // ---- funds ----
    addFund: async (form) => {
      const { data: created } = await api.post(endpoints.funds(), fundToAPI(form))
      await refresh()
      return created.data.id
    },
    updateFund: async (id, patch) => {
      await api.patch(endpoints.fund(id), fundToAPI(patch))
      await refresh()
    },
    removeFund: async (id) => {
      await api.delete(endpoints.fund(id))
      await refresh()
    },

    // ---- projects ----
    addProject: async (form) => {
      await api.post(endpoints.projects(), projectToAPI(form))
      await refresh()
    },
    updateProject: async (id, patch) => {
      await api.patch(endpoints.project(id), projectToAPI(patch))
      await refresh()
    },
    removeProject: async (id) => {
      await api.delete(endpoints.project(id))
      await refresh()
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
      await refresh()
      return created.data.id
    },
    updateExpense: async (id, patch) => {
      await api.patch(endpoints.expense(id), expenseToAPI(patch))
      await refresh()
    },
    removeExpense: async (id) => {
      await api.delete(endpoints.expense(id))
      await refresh()
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
      await refresh()
    },
    updateReceipt: async (id, patch) => {
      // SCHEMA GAP: "verified" isn't a real column — stored client-side.
      if (typeof patch.verified === 'boolean') setMeta('receiptVerified', id, patch.verified)
      await refresh()
    },
    removeReceipt: async (id) => {
      await api.delete(endpoints.receipt(id))
      await refresh()
    },

    refreshAll: () => refresh(),
  }), [refresh])

  return <DataContext.Provider value={{ ...data, ...actions, loading, loadError, refresh }}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
