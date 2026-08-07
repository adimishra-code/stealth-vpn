import { Routes, Route } from 'react-router'
import { Suspense, lazy, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ProtectedRoute from './router/ProtectedRoute'
import AdminRoute from './router/AdminRoute'
import Layout from './components/Layout'
import ToastHost from './components/ToastHost'
import { useMeQuery } from './features/auth/authApi'
import { selectToken, selectUser, setUser, clearCredentials } from './features/auth/authSlice'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Dashboard from './pages/Dashboard'
import Servers from './pages/Servers'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

// Admin (75 kB — recharts alone is most of it) and Billing only load once the
// user actually navigates to them, instead of paying for them on every visit.
const Admin = lazy(() => import('./pages/Admin'))
const Billing = lazy(() => import('./pages/Billing'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <p className="font-mono text-sm text-faint animate-pulse">loading…</p>
    </div>
  )
}

// A page reload leaves the token in localStorage but the user object empty.
// Route guards read user.role, so on a cold load we must block until /me has
// resolved AND landed in the store — otherwise guards run against a null user
// and bounce admins off /admin.
function useSessionBootstrap() {
  const dispatch = useDispatch()
  const token = useSelector(selectToken)
  const user = useSelector(selectUser)
  const { data, isError, isSuccess } = useMeQuery(undefined, { skip: !token })

  useEffect(() => {
    if (isSuccess && data?.user) dispatch(setUser(data.user))
  }, [isSuccess, data, dispatch])

  useEffect(() => {
    if (isError) dispatch(clearCredentials())
  }, [isError, dispatch])

  // Already have a user (e.g. just logged in) — nothing to wait for.
  return !token || !!user || isError
}

export default function App() {
  const ready = useSessionBootstrap()

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-sm text-faint">establishing tunnel…</p>
      </div>
    )
  }

  return (
    <>
      {/* Global toast layer — mounts once, survives route changes */}
      <ToastHost />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />

        <Route element={<Layout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Billing /></Suspense></ProtectedRoute>} />
          <Route path="/servers" element={<ProtectedRoute><Servers /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminRoute><Suspense fallback={<PageLoader />}><Admin /></Suspense></AdminRoute>} />

          {/* Must be the LAST route — catches every unmatched path. */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  )
}
