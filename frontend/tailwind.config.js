/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Pure neutral greys — no blue anywhere in the base.
        void: '#0a0a0b',        // background — deepest layer
        surface: '#151517',     // cards, panels, sidebar
        raised: '#1d1d20',      // hover state, elevated surfaces, tooltips
        line: '#28282d',        // subtle borders, dividers
        'line-strong': '#38383f', // hover borders, focus rings
        ink: '#f4f4f5',         // text primary
        muted: '#8f8f98',       // text secondary
        faint: '#5d5d66',       // text tertiary (captions, placeholders)
        // Accent — "signal" teal. Chosen because it collides with no status
        // colour (green=online, amber=warn, rose=danger stay reserved) and
        // reads as calibrated instrumentation rather than generic SaaS blue.
        accent: {
          50: '#ecfdfa',
          100: '#ccfbf3',
          200: '#99f6e8',
          300: '#5eead8',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Semantic status colours — logic-driven, reserved for status only.
        ok: '#34d399',
        warn: '#fbbf24',
        danger: '#fb7185',
        // Back-compat aliases: old stealth-* references resolve to neutrals
        // (never blue), so any un-redesigned surface degrades gracefully.
        stealth: {
          975: '#0a0a0b',
          950: '#0e0e10',
          900: '#151517',
          850: '#19191c',
          800: '#1d1d20',
          700: '#28282d',
          600: '#38383f',
          500: '#45454e',
          400: '#8f8f98',
          300: '#a1a1ab',
          200: '#d4d4d8',
          100: '#f4f4f5',
        },
      },
      fontFamily: {
        sans: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.2, 0, 0, 1)',
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '250ms',
        slow: '400ms',
      },
      boxShadow: {
        card: 'inset 0 1px 0 0 rgba(255,255,255,0.035), 0 1px 2px 0 rgba(0,0,0,0.45), 0 10px 30px -14px rgba(0,0,0,0.7)',
        'card-hover': 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 2px 4px 0 rgba(0,0,0,0.4), 0 18px 44px -16px rgba(0,0,0,0.8)',
        'glow-accent': '0 0 0 1px rgba(45,212,191,0.22), 0 6px 28px -8px rgba(45,212,191,0.35)',
        'glow-accent-strong': '0 0 0 1px rgba(45,212,191,0.35), 0 10px 36px -8px rgba(45,212,191,0.5)',
        inset: 'inset 0 2px 6px rgba(0,0,0,0.4)',
        tooltip: '0 4px 16px -4px rgba(0,0,0,0.6)',
        dot: '0 0 12px rgba(52,211,153,0.45)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(45,212,191,0)' },
          '50%': { boxShadow: '0 0 0 6px rgba(45,212,191,0.10)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(28px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shake: {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-3px)' },
          '40%, 60%': { transform: 'translateX(3px)' },
        },
        // Signature: "The Latch" — a ring of light contracts into the shield
        // like a lock seating. One-shot, plays only on state change to green.
        latch: {
          '0%': { transform: 'scale(1.7)', opacity: '0.5' },
          '55%': { transform: 'scale(1)', opacity: '0.9' },
          '100%': { transform: 'scale(0.9)', opacity: '0' },
        },
        pop: {
          from: { opacity: '0', transform: 'scale(0.96) translateY(4px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'ping-dot': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '80%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 250ms ease-out both',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 250ms cubic-bezier(0.2, 0, 0, 1) both',
        shake: 'shake 320ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        latch: 'latch 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
        pop: 'pop 200ms cubic-bezier(0.2, 0, 0, 1) both',
        'ping-dot': 'ping-dot 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
}
