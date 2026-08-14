import { Navigate } from 'react-router'
import { useSelector } from 'react-redux'
import PropTypes from 'prop-types'
import { selectToken } from '../features/auth/authSlice'

export default function ProtectedRoute({ children }) {
  const token = useSelector(selectToken)

  // Presence check only: an expired token (15 min lifetime) is handled
  // transparently by the reauth baseQuery in app/api.js, which rotates the
  // refresh cookie and retries. The guard only keeps visitors off authed pages.
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
}
