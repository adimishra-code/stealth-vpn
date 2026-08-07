import { useEffect, useState } from 'react'

// Delays reflecting a fast-changing value (like a search input) into its
// dependents until it settles for `delay` ms — prevents a network query from
// firing on every keystroke.
export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
