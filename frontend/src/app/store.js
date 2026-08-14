import { configureStore } from '@reduxjs/toolkit'
import { api } from './api'
import authReducer, { clearCredentials } from '../features/auth/authSlice'

// TELEM-01: a reducer throwing mid-dispatch would crash the app with a
// confusing stack — catch at the dispatch boundary and report instead.
const reportTelemetry = (error) => {
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        message: error && error.message,
        stack: error && error.stack,
        url: window.location.href,
      }),
    }).catch(() => {})
  } catch {
    // telemetry must never throw
  }
}

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
  },
  // On clearCredentials (logout, logoutAll, session-expired), wipe the RTK
  // cache too — otherwise a fresh login on the same browser can briefly see
  // the previous user's /auth/me, /devices, /payment/invoices from cache.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // api.util.resetApiState carries an unserializable object; the
      // check is more noise than value for our slice.
      serializableCheck: {
        ignoredActions: ['api/reset'],
      },
    }).concat(api.middleware),
})

// Watch for the auth-slice logout signal and purge the RTK cache alongside.
store.dispatch = ((next) => {
  let dispatchedClear = false
  return (action) => {
    const result = next(action)
    if (action.type === clearCredentials.type) {
      dispatchedClear = true
    } else if (dispatchedClear && typeof action.type === 'string' && action.type.startsWith('api/')) {
      dispatchedClear = false
    }
    if (action.type === clearCredentials.type) {
      store.dispatch(api.util.resetApiState())
    }
    return result
  }
})(store.dispatch)

const originalDispatch = store.dispatch
store.dispatch = (action) => {
  try {
    return originalDispatch(action)
  } catch (err) {
    reportTelemetry(err)
    throw err
  }
}
