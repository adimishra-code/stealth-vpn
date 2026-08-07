import { Navigate } from 'react-router'
import { useSelector } from 'react-redux'
import PropTypes from 'prop-types'
import { selectToken } from '../features/auth/authSlice'

export default function ProtectedRoute({ children }) {
  const token = useSelector(selectToken)

  // Presence check only: the access token may be expired (15 min lifetime) —
  // that is handled transparently by the reauth baseQuery in app/api.js, which
  // rotates the refresh cookie and retries the request. This guard's only job
  // is to keep anonymous visitors off authed pages.
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
}
