import { Component } from 'react'
import PropTypes from 'prop-types'

// Last line of defense: if any page throws during render, show a recoverable
// fallback instead of a blank white screen. The error is logged so it reaches
// the operator (browser console / Sentry when wired up).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ERROR BOUNDARY]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-void p-4">
          <div className="card max-w-md text-center py-10 px-8">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="font-display text-xl font-semibold text-ink mb-2">Something went wrong</h1>
            <p className="text-sm text-muted mb-6">
              The page hit an unexpected error. Reloading usually fixes it.
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary">
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
}
