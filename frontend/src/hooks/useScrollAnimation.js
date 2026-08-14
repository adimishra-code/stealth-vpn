import { useEffect } from 'react'

// Shared IntersectionObserver config + reduced-motion guard — the single
// source of truth so hook and Reveal thresholds never drift apart.
export const SCROLL_OBSERVER_OPTIONS = { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }

// Reduced motion (or no IntersectionObserver): content must be visible immediately.
export function shouldRenderInstantly() {
  if (typeof window === 'undefined') return true
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
    typeof IntersectionObserver === 'undefined'
  )
}

// Adds .in-view to .animate-on-scroll elements as they scroll in, then
// stops observing — the Reveal pattern without a wrapper component.
export function useScrollAnimation() {
  useEffect(() => {
    if (shouldRenderInstantly()) {
      document.querySelectorAll('.animate-on-scroll').forEach((el) => el.classList.add('in-view'))
      return
    }
    const elements = document.querySelectorAll('.animate-on-scroll')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view')
            observer.unobserve(entry.target)
          }
        })
      },
      SCROLL_OBSERVER_OPTIONS
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}
