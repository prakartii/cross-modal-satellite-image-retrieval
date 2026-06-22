/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas:   '#0B1220',
        surface:  '#111827',
        card:     '#1A2333',
        'card-hover': '#1E2A3A',
        border:   '#2D3748',
        'border-hover': '#4A5568',

        'blue-primary':  '#3B82F6',
        'blue-dim':      '#2563EB',
        'blue-surface':  '#1E3A5F',
        'blue-faint':    '#0F2040',

        'teal-primary':  '#14B8A6',
        'teal-dim':      '#0D9488',
        'teal-surface':  '#0F3D38',

        'success':         '#22C55E',
        'success-surface': '#052E16',
        'warning':         '#F59E0B',
        'warning-surface': '#431407',
        'danger':          '#EF4444',
        'danger-surface':  '#450A0A',

        'text-primary':   '#F8FAFC',
        'text-secondary': '#94A3B8',
        'text-tertiary':  '#64748B',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Satoshi', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['Geist Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['3rem',    { lineHeight: '1.1', fontWeight: '700' }],
        'display-xl':  ['2.25rem', { lineHeight: '1.15', fontWeight: '700' }],
        'display-l':   ['1.75rem', { lineHeight: '1.2', fontWeight: '600' }],
        'heading-1':   ['1.5rem',  { lineHeight: '1.3', fontWeight: '600' }],
        'heading-2':   ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-3':   ['1rem',    { lineHeight: '1.4', fontWeight: '600' }],
        'body-l':      ['1rem',    { lineHeight: '1.5', fontWeight: '400' }],
        'body-m':      ['0.875rem',{ lineHeight: '1.5', fontWeight: '400' }],
        'body-s':      ['0.8125rem',{ lineHeight: '1.5', fontWeight: '400' }],
        'caption':     ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
        'overline':    ['0.6875rem',{ lineHeight: '1.2', fontWeight: '500', letterSpacing: '0.08em' }],
      },
      spacing: {
        'xs':    '4px',
        'sm':    '8px',
        'md-sm': '12px',
        'md':    '16px',
        'md-lg': '20px',
        'lg':    '24px',
        'xl':    '32px',
        '2xl':   '40px',
        '3xl':   '48px',
        '4xl':   '64px',
        '88':    '22rem',
        '18':    '4.5rem',
      },
      borderRadius: {
        'subtle': '2px',
        'sm':     '4px',
        'md':     '6px',
        DEFAULT:  '8px',
        'lg':     '12px',
        'xl':     '16px',
      },
      boxShadow: {
        'card':    '0 1px 3px rgba(0,0,0,0.3)',
        'panel':   '0 4px 16px rgba(0,0,0,0.4)',
        'modal':   '0 8px 32px rgba(0,0,0,0.6)',
        'overlay': '0 16px 64px rgba(0,0,0,0.7)',
        'glow-blue': '0 0 20px rgba(59,130,246,0.2)',
        'glow-teal': '0 0 20px rgba(20,184,166,0.2)',
      },
      animation: {
        'spin-slow': 'spin 120s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'arc-draw': 'arcDraw 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.0, 0.0, 0.2, 1) forwards',
        'slide-left': 'slideLeft 0.3s cubic-bezier(0.0, 0.0, 0.2, 1) forwards',
        'slide-right': 'slideRight 0.3s cubic-bezier(0.0, 0.0, 0.2, 1) forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        arcDraw: {
          from: { strokeDashoffset: '1000' },
          to:   { strokeDashoffset: '0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to:   { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          from: { transform: 'translateX(-100%)', opacity: '0' },
          to:   { transform: 'translateX(0)', opacity: '1' },
        },
        slideRight: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to:   { transform: 'translateX(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
