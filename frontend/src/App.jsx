import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ProtectedRoute from './router/ProtectedRoute'
import AdminRoute from './router/AdminRoute'
import Layout from './components/Layout'
import { useMeQuery } from './features/auth/authApi'
import { selectToken, selectUser, setUser, clearCredentials } from './features/auth/authSlice'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Billing from './pages/Billing'
import Servers from './pages/Servers'
import Settings from './pages/Settings'
import Admin from './pages/Admin'

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
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading…
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
        <Route path="/servers" element={<ProtectedRoute><Servers /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
      </Route>
    </Routes>
  )
}
