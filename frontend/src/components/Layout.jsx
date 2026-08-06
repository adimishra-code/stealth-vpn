import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { selectUser, clearCredentials } from '../features/auth/authSlice'
import { useLogoutMutation } from '../features/auth/authApi'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/servers', label: 'Servers' },
  { to: '/billing', label: 'Billing' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [logout] = useLogoutMutation()

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // ignore network errors — clear locally anyway
    }
    dispatch(clearCredentials())
    navigate('/')
  }

  const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'].includes(location.pathname)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-stealth-700/50 bg-stealth-900/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-white text-lg">
            <span className="w-8 h-8 rounded-lg bg-stealth-500 flex items-center justify-center">🛡</span>
            StealthVPN
          </Link>

          {!isAuthPage && (
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname.startsWith(item.to)
                      ? 'bg-stealth-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname.startsWith('/admin')
                      ? 'bg-stealth-800 text-white'
                      : 'text-amber-400 hover:text-amber-300'
                  }`}
                >
                  Admin
                </Link>
              )}
            </nav>
          )}

          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400 hidden sm:block">{user.email}</span>
              <button onClick={handleLogout} className="btn-secondary !py-1.5 !px-3 text-sm">
                Logout
              </button>
            </div>
          ) : (
            !isAuthPage && (
              <div className="flex items-center gap-3">
                <Link to="/login" className="text-sm text-slate-400 hover:text-white">Log in</Link>
                <Link to="/register" className="btn-primary !py-1.5 !px-3 text-sm">Sign up</Link>
              </div>
            )
          )}
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-stealth-700/50 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} StealthVPN — No traffic logs. No IP logs. Ever.
        </div>
      </footer>
    </div>
  )
}
