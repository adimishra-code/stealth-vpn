import { Navigate } from 'react-router'
import { useSelector } from 'react-redux'
import { selectToken } from '../features/auth/authSlice'

export default function ProtectedRoute({ children }) {
  const token = useSelector(selectToken)
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}
