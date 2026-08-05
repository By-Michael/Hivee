import axios from 'axios'

// Point this at your Express backend. In dev, Vite proxies /api -> http://localhost:4000
// (see vite.config.js), and the backend mounts every route under /api/v1.
// In prod, set VITE_API_URL to your deployed API base, e.g. https://api.example.com/api/v1.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cfms_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('cfms_token')
      localStorage.removeItem('cfms_user')
    }
    return Promise.reject(err)
  }
)

// REST endpoint map — matches the Core Modules from the CFMS spec.
export const endpoints = {
  login: () => '/auth/login',
  register: () => '/auth/register-community',
  me: () => '/auth/me',
  logout: () => '/auth/logout',
  refresh: () => '/auth/refresh',
  changePassword: () => '/auth/change-password',

  residents: () => '/residents',
  resident: (id) => `/residents/${id}`,

  fees: () => '/fees',
  fee: (id) => `/fees/${id}`,

  payments: () => '/payments',
  payment: (id) => `/payments/${id}`,

  funds: () => '/funds',
  fund: (id) => `/funds/${id}`,

  projects: () => '/projects',
  project: (id) => `/projects/${id}`,

  expenses: () => '/expenses',
  expense: (id) => `/expenses/${id}`,

  receipts: () => '/receipts',
  receipt: (id) => `/receipts/${id}`,

  reports: {
    summary: () => '/reports/summary',
    collections: () => '/reports/collections',
    expenses: () => '/reports/expenses',
  },
}

// Uploaded files (receipts) are served from the API host's root
// (e.g. /uploads/...), not under /api/v1 — this builds the correct
// absolute URL for viewing/downloading them regardless of environment.
const API_ROOT = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/api\/v1\/?$/, '')
export function fileUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${API_ROOT}${path.startsWith('/') ? '' : '/'}${path}`
}

export default api
