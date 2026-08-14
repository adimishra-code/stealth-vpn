// CSRF-03: auth state must never persist to web storage (XSS + shared-session
// exposure). Also pins the token/user contract the route guards depend on.
import { describe, it, expect, beforeEach } from 'vitest'
import { Routes, Route } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import { setCredentials, clearCredentials, setUser, selectToken, selectUser } from './authSlice'
import authReducer from './authSlice'
import { api } from '../../app/api'
import { renderWithProviders } from '../../test/test-utils'
import ProtectedRoute from '../../router/ProtectedRoute'
import AdminRoute from '../../router/AdminRoute'

function makeStore(preloadedState = {}) {
  return configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
    preloadedState,
  })
}

describe('authSlice (CSRF-03: in-memory only)', () => {
  let store

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    store = makeStore()
  })

  it('starts with no token and writes nothing to storage', () => {
    expect(store.getState().auth.accessToken).toBeNull()
    expect(sessionStorage.getItem('sv_token')).toBeNull()
    expect(localStorage.getItem('sv_token')).toBeNull()
  })

  it('setCredentials keeps the token in memory, never in web storage', () => {
    store.dispatch(setCredentials({ accessToken: 'jwt-token', user: { id: 'u1', role: 'user' } }))

    expect(selectToken(store.getState())).toBe('jwt-token')
    expect(selectUser(store.getState()).role).toBe('user')
    expect(sessionStorage.getItem('sv_token')).toBeNull()
    expect(localStorage.getItem('sv_token')).toBeNull()
  })

  it('setUser replaces the user without touching the token', () => {
    store.dispatch(setCredentials({ accessToken: 'jwt-token', user: null }))
    store.dispatch(setUser({ id: 'u1', role: 'user' }))

    expect(selectToken(store.getState())).toBe('jwt-token')
    expect(selectUser(store.getState()).id).toBe('u1')
  })

  it('clearCredentials wipes both user and token', () => {
    store.dispatch(setCredentials({ accessToken: 'jwt-token', user: { id: 'u1' } }))
    store.dispatch(clearCredentials())

    expect(store.getState().auth).toEqual({ user: null, accessToken: null, loading: false })
    expect(sessionStorage.getItem('sv_token')).toBeNull()
  })
})

describe('ProtectedRoute', () => {
  it('redirects anonymous visitors to /login', () => {
    const { getByText } = renderWithProviders(
      <Routes>
        <Route path="/" element={<ProtectedRoute><div>secret</div></ProtectedRoute>} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>,
      { preloadedState: { auth: { user: null, accessToken: null, loading: false } } }
    )

    expect(getByText('login-page')).toBeInTheDocument()
  })

  it('renders children when a token exists', () => {
    const { getByText } = renderWithProviders(
      <Routes>
        <Route path="/" element={<ProtectedRoute><div>secret</div></ProtectedRoute>} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>,
      { preloadedState: { auth: { user: null, accessToken: 'jwt-token', loading: false } } }
    )

    expect(getByText('secret')).toBeInTheDocument()
  })
})

describe('AdminRoute', () => {
  it('redirects non-admins to /dashboard', () => {
    const { getByText } = renderWithProviders(
      <Routes>
        <Route path="/" element={<AdminRoute><div>admin-panel</div></AdminRoute>} />
        <Route path="/dashboard" element={<div>dashboard-page</div>} />
      </Routes>,
      { preloadedState: { auth: { user: { role: 'user' }, accessToken: 'jwt-token', loading: false } } }
    )

    expect(getByText('dashboard-page')).toBeInTheDocument()
  })

  it('renders the panel only for admins', () => {
    const { getByText } = renderWithProviders(
      <Routes>
        <Route path="/" element={<AdminRoute><div>admin-panel</div></AdminRoute>} />
        <Route path="/dashboard" element={<div>dashboard-page</div>} />
      </Routes>,
      { preloadedState: { auth: { user: { role: 'admin' }, accessToken: 'jwt-token', loading: false } } }
    )

    expect(getByText('admin-panel')).toBeInTheDocument()
  })

  it('redirects to /login when logged out even with a stale user object', () => {
    const { getByText } = renderWithProviders(
      <Routes>
        <Route path="/" element={<AdminRoute><div>admin-panel</div></AdminRoute>} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>,
      { preloadedState: { auth: { user: { role: 'admin' }, accessToken: null, loading: false } } }
    )

    expect(getByText('login-page')).toBeInTheDocument()
  })
})
