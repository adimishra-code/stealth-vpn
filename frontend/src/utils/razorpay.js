// Injects the Razorpay checkout script once, then resolves. Rejects if the
// script fails to load so callers can surface an error instead of a silent
// dead button.
export async function loadRazorpay() {
  if (typeof window.Razorpay !== 'undefined') return
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('Razorpay script failed to load'))
    document.body.appendChild(s)
  })
}
