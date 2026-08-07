const listeners = new Set()
let nextId = 0

function emit(type, message) {
  const id = ++nextId
  listeners.forEach((fn) => fn({ id, type, message }))
  return id
}

export const toast = {
  success: (message) => emit('success', message),
  error: (message) => emit('error', message),
  warning: (message) => emit('warning', message),
  info: (message) => emit('info', message),
}

export function subscribeToToasts(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
