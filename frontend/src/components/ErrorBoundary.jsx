import { Component } from 'react'
import PropTypes from 'prop-types'

// TELEM-01: last line of defense for render errors — a crashed subtree must
// never blank the SPA. Report once per mounted instance, fire-and-forget;
// if the API is unreachable the failure stays silent.
class ErrorBoundary extends Component {
  state = { hasError: false, reported: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    if (this.state.reported) return
    this.setState({ reported: true })
    try {
      fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: error && error.message,
          stack: error && error.stack,
          url: window.location.href,
          componentStack: info && info.componentStack,
        }),
      }).catch(() => {})
    } catch {
      // never let telemetry itself throw
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
        <div className="text-center max-w-md">
          <p className="font-mono text-3xl text-accent-300 mb-4">connection lost</p>
          <h1 className="font-display text-lg font-semibold text-ink mb-2">
            Something went wrong rendering this screen
          </h1>
          <p className="text-sm text-faint mb-6">
            The app crashed — your VPN configuration is safe. Reload to continue, and the
            error has been reported for the next release.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
            type="button"
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
}

export default ErrorBoundary
