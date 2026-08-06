import { Navigate } from 'react-router'
import { useSelector } from 'react-redux'
import { selectUser, selectToken } from '../features/auth/authSlice'

export default function AdminRoute({ children }) {
  const token = useSelector(selectToken)
  const user = useSelector(selectUser)
  if (!token) return <Navigate to="/login" replace />
  if (!user || user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}
