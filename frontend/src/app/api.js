import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { setCredentials, clearCredentials } from '../features/auth/authSlice'
import { toast } from '../lib/toast'

// CSRF-02: the backend signs a double-submit token into an httpOnly cookie and
// expects it mirrored in x-csrf-token. The cookie is JS-unreadable, so the
// token comes from /api/csrf-token; if null the header is omitted and
// state-changing calls fail closed (403).
let csrfToken = null
let csrfTokenPromise = null
const ensureCsrfToken = () => {
  if (csrfToken) return Promise.resolve(csrfToken)
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch('/api/csrf-token', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        csrfToken = d?.csrfToken ?? null
        return csrfToken
      })
      .finally(() => {
        csrfTokenPromise = null
      })
  }
  return csrfTokenPromise
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
  prepareHeaders: async (headers, { getState }) => {
    const token = getState().auth.accessToken
    if (token) headers.set('Authorization', `Bearer ${token}`)
    headers.set('x-csrf-token', (await ensureCsrfToken()) ?? '')
    return headers
  },
})

// Concurrent 401s must share one refresh — the backend rotates the refresh
// token per call, so parallel refreshes invalidate each other and log out.
let refreshPromise = null

const baseQueryWithReauth = async (args, apiCtx, extraOptions) => {
  let result = await rawBaseQuery(args, apiCtx, extraOptions)

  if (result.error?.status !== 401) return result

  const isAuthCall = typeof args === 'string'
    ? args === '/auth/logout' || args === '/auth/revoke-all'
    : String(args?.url ?? '').startsWith('/auth/logout') || String(args?.url ?? '').startsWith('/auth/revoke-all')
  if (isAuthCall) return result

  if (!refreshPromise) {
    refreshPromise = rawBaseQuery(
      { url: '/auth/refresh', method: 'POST' },
      apiCtx,
      extraOptions
    ).finally(() => {
      refreshPromise = null
    })
  }

  const refreshResult = await refreshPromise

  if (!refreshResult.data?.accessToken) {
    // Refresh failed: cookie gone (expired/revoked) or refresh token pulled
    // from MongoDB by logout-all. Clear Redux; the next navigation triggers
    // ProtectedRoute to /login. Toast informs the user.
    apiCtx.dispatch(clearCredentials())
    toast.warn('Session expired — please log in again')
    return result
  }

  apiCtx.dispatch(setCredentials({ accessToken: refreshResult.data.accessToken }))
  return rawBaseQuery(args, apiCtx, extraOptions)
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Devices', 'Invoices', 'Servers', 'Users', 'Revenue', 'Alerts', 'Bandwidth', 'AuditLogs'],
  endpoints: () => ({}),
})

export default api
