import { useEffect, useState } from 'react'

// Defers a fast-changing value (e.g. search input) until it settles for
// `delay` ms — prevents a network query firing on every keystroke.
export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
