import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { setCredentials, clearCredentials } from '../features/auth/authSlice'

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.accessToken
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

// Concurrent 401s must not each trigger their own refresh — the backend rotates
// the refresh token on every call, so parallel refreshes invalidate each other
// and log the user out. The first 401 owns the refresh; the rest await it.
let refreshPromise = null

const baseQueryWithReauth = async (args, apiCtx, extraOptions) => {
  let result = await rawBaseQuery(args, apiCtx, extraOptions)

  if (result.error?.status !== 401) return result

  const isAuthCall = typeof args === 'string'
    ? args.startsWith('/auth/')
    : String(args?.url ?? '').startsWith('/auth/')
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
    apiCtx.dispatch(clearCredentials())
    return result
  }

  apiCtx.dispatch(setCredentials({ accessToken: refreshResult.data.accessToken }))
  return rawBaseQuery(args, apiCtx, extraOptions)
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Devices', 'Invoices', 'Servers', 'Users', 'Revenue', 'Alerts', 'Bandwidth'],
  endpoints: () => ({}),
})

export default api
