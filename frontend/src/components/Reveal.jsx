import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { SCROLL_OBSERVER_OPTIONS, shouldRenderInstantly } from '../hooks/useScrollAnimation'

// Reveals children once on scroll into view. Uses IntersectionObserver (no
// scroll-listener cost); above-the-fold and reduced-motion content is instant.
export default function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  const [instant, setInstant] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (shouldRenderInstantly()) {
      // One-shot flip before first paint — content must never stay hidden.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInstant(true)
      setShown(true)
      return
    }

    // Already in view on load → render instantly, no entrance.
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.85) {
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
