import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { SCROLL_OBSERVER_OPTIONS, shouldRenderInstantly } from '../hooks/useScrollAnimation'

// Reveals children once when they scroll into view. Uses IntersectionObserver
// rather than a scroll listener so it costs nothing on the main thread.
// Above-the-fold content renders instantly (no animation); only content
// below the fold enters with a fade-up. Reduced motion renders instantly.
export default function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  const [instant, setInstant] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // No IO (or reduced motion): render visible immediately rather than hiding
    // content behind an animation that will never run.
    if (shouldRenderInstantly()) {
      // Intentional one-shot flip before first paint — content must never
      // stay stuck hidden behind an animation that cannot run.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInstant(true)
      setShown(true)
      return
    }

    // Already in view on load → render instantly, no entrance.
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.85) {
      // Same one-shot flip: above-the-fold content must not animate.
      setInstant(true)
      setShown(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      SCROLL_OBSERVER_OPTIONS
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${instant ? '' : shown ? 'animate-on-scroll in-view' : 'animate-on-scroll'} ${className}`}
      style={{ animationDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}

Reveal.propTypes = {
  children: PropTypes.node.isRequired,
  delay: PropTypes.number,
  className: PropTypes.string,
}
