import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 text-center px-4">
      <p className="font-mono text-accent-300 text-sm tracking-widest uppercase">404</p>
      <h1 className="text-4xl font-bold text-ink">Page not found</h1>
      <p className="text-muted max-w-sm">
        This route doesn&apos;t exist. You may have followed a broken link
        or typed the address incorrectly.
      </p>
      <Link
        to="/"
        className="btn-primary"
      >
        Go home
      </Link>
    </div>
  )
}
