import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useDispatch, useSelector } from 'react-redux'
import { LayoutDashboard, Server, CreditCard, Settings as SettingsIcon, ShieldCheck, Menu, X, LogOut } from 'lucide-react'
import { selectUser, clearCredentials } from '../features/auth/authSlice'
import { useLogoutMutation } from '../features/auth/authApi'
import { useListDevicesQuery } from '../features/devices/devicesApi'
import PropTypes from 'prop-types'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/servers', label: 'Servers', icon: Server },
  { to: '/billing', label: 'Billing', icon: CreditCard },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']

function Brand({ className = '' }) {
  return (
    <span className={`font-mono font-semibold tracking-tight text-ink ${className}`}>
      stealth<span className="text-accent-400">vpn</span>
    </span>
  )
}

Brand.propTypes = {
  className: PropTypes.string,
}

export default function Layout() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [logout] = useLogoutMutation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Tunnel status: a paid plan with at least one active device = protected.
  const { data: devicesData } = useListDevicesQuery(undefined, { skip: !user || AUTH_PATHS.includes(location.pathname) })
  const tunneled = !!user && user.plan !== 'free' && (devicesData?.devices || []).some((d) => d.isActive)

  // A route change must close the drawer, or it stays open over the new page.
  // Done as a state adjustment during render (React's recommended replacement
  // for setState-in-effect) so no cascading render is produced.
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname)
    setMenuOpen(false)
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // ignore network errors — clear locally anyway
    }
    dispatch(clearCredentials())
    navigate('/')
  }

  const isAuthPage = AUTH_PATHS.includes(location.pathname)
  const showNav = !isAuthPage && !!user
  const allNav = user?.role === 'admin'
    ? [...navItems, { to: '/admin', label: 'Admin', icon: ShieldCheck, accent: true }]
    : navItems

  // ── Sliding accent bar: sits on the active item, slides to hovered item,
  // snaps back on mouse leave. offsetTop math keeps it vertically centred
  // on the 40px nav rows against the 24px bar.
  const navRef = useRef(null)
  const [barTop, setBarTop] = useState(0)
  const [barVisible, setBarVisible] = useState(false)
  const BAR_HEIGHT = 24
  const centerTop = (el) => {
    if (!el) return
    setBarTop(el.offsetTop + (el.offsetHeight - BAR_HEIGHT) / 2)
  }
  useEffect(() => {
    centerTop(navRef.current?.querySelector('[data-nav-active="true"]'))
    setBarVisible(true)
  }, [location.pathname])
  const snapBarToActive = () => {
    centerTop(navRef.current?.querySelector('[data-nav-active="true"]'))
  }

  const navLinkClass = (active, accent) =>
    `group relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-fast ${
      active
        ? 'bg-raised text-ink'
        : accent
          ? 'text-warn/90 hover:text-warn hover:bg-raised/70'
          : 'text-muted hover:text-ink hover:bg-raised/70'
    }`

  return (
    <div className={showNav ? 'min-h-screen flex flex-col md:pl-60' : 'min-h-screen flex flex-col'}>
      {/* ── Sidebar (desktop) — blends into the background on its left edge ── */}
      {showNav && (
        <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 z-40 flex-col bg-surface border-r border-line">
          <div className="px-5 h-16 flex items-center">
            <Link to="/" className="flex items-center gap-2.5 glow-accent" aria-label="StealthVPN home">
              <Brand className="text-[15px]" />
            </Link>
          </div>

          <nav ref={navRef} className="relative flex-1 px-3 space-y-1 mt-2">
            <p className="px-3.5 pb-1.5 text-2xs font-mono uppercase tracking-[0.2em] text-faint">Navigation</p>
            <span
              aria-hidden="true"
              className="absolute left-3 w-[3px] rounded-full bg-accent-400 shadow-[0_0_8px_rgba(45,212,191,0.7)] transition-all duration-300 ease-smooth"
              style={{ top: barTop, height: BAR_HEIGHT, opacity: barVisible ? 1 : 0 }}
            />
            {allNav.map(({ to, label, icon: Icon, accent }) => {
              const active = location.pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  data-nav-active={active || undefined}
                  onMouseEnter={(e) => centerTop(e.currentTarget)}
                  onMouseLeave={snapBarToActive}
                  className={navLinkClass(active, accent)}
                >
                  <Icon size={16} className={active ? 'text-accent-400' : accent ? '' : 'text-faint group-hover:text-ink'} strokeWidth={active ? 2.25 : 1.75} />
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Connection status — the single question the app must answer */}
          <div className="px-4 py-4 border-t border-line">
            <div className="flex items-center gap-2.5 px-1">
              <span className="relative flex h-2 w-2">
                {tunneled && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-ok animate-ping-dot" />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${tunneled ? 'bg-ok shadow-dot' : 'bg-faint'}`} />
              </span>
              <div className="min-w-0">
                <p className={`text-[13px] font-medium leading-tight ${tunneled ? 'text-ink' : 'text-muted'}`}>
                  {tunneled ? 'Tunnel active' : 'Not connected'}
                </p>
                <p className="font-mono text-[11px] text-faint leading-tight">
                  {tunneled ? 'wg · aes-256-gcm' : 'standby'}
                </p>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ── Mobile top bar (auth pages carry their own brand, no bar) ── */}
      <header className={`md:hidden sticky top-0 z-40 border-b border-line bg-void/95 ${isAuthPage ? 'hidden' : ''}`}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <Brand className="text-[15px]" />
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                <span className="text-sm text-muted hidden sm:block max-w-40 truncate">{user.email}</span>
                <button onClick={handleLogout} className="btn-secondary !py-1.5 !px-3 text-sm">
                  <LogOut size={14} />
                  Logout
                </button>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="p-2 rounded-lg text-muted hover:bg-raised hover:text-ink transition-colors duration-fast"
                  aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={menuOpen}
                >
                  {menuOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
              </>
            ) : (
              !isAuthPage && (
                <>
                  <Link to="/login" className="text-sm text-muted hover:text-ink px-3 py-2 transition-colors duration-fast">Log in</Link>
                  <Link to="/register" className="btn-primary !py-1.5 !px-4 text-sm">Sign up</Link>
                </>
              )
            )}
          </div>
        </div>

        {/* Mobile drawer */}
        {showNav && menuOpen && (
          <div className="md:hidden border-t border-line glass animate-fade-in">
            <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-1">
              {allNav.map(({ to, label, icon: Icon, accent }) => {
                const active = location.pathname.startsWith(to)
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-fast ${
                      active
                        ? 'bg-raised text-ink'
                        : accent
                          ? 'text-warn/90'
                          : 'text-muted hover:bg-raised hover:text-ink'
                    }`}
                  >
                    <Icon size={18} className={active ? 'text-accent-400' : ''} />
                    {label}
                  </Link>
                )
              })}
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted hover:bg-raised hover:text-ink text-left transition-colors duration-fast"
              >
                <LogOut size={18} />
                Logout
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* ── Page — keyed on pathname so each route enters with fade-up ── */}
      <main className="flex-1">
        <div key={location.pathname} className="page-enter max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-line py-6 mt-4">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-faint">
          © {new Date().getFullYear()} <Brand /> — No content logs. No browsing history. Ever.
        </div>
      </footer>
    </div>
  )
}
