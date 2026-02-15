/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        tg: {
          // Primary colors
          bg: 'var(--tg-bg-color)',
          'bg-secondary': 'var(--tg-bg-secondary)',
          text: 'var(--tg-text-color)',
          'text-secondary': 'var(--tg-text-secondary)',
          link: 'var(--tg-link-color)',
          button: 'var(--tg-button-color)',
          'button-text': 'var(--tg-button-text-color)',
          separator: 'var(--tg-separator)',
          // Status colors
          success: 'var(--tg-success)',
          warning: 'var(--tg-warning)',
          error: 'var(--tg-error)',
          // Legacy mappings for Telegram SDK
          hint: 'var(--tg-text-secondary)',
          'secondary-bg': 'var(--tg-bg-secondary)',
        },
        accent: {
          DEFAULT: '#2AABEE',
          light: '#5BC0F2',
          dark: '#1E96D1',
        },
      },
      borderRadius: {
        'tg': '10px',
        'tg-md': '12px',
        'tg-lg': '14px',
      },
      boxShadow: {
        'tg': '0 1px 2px rgba(0, 0, 0, 0.08)',
        'tg-card': '0 1px 3px rgba(0, 0, 0, 0.1)',
        'tg-elevated': '0 2px 8px rgba(0, 0, 0, 0.12)',
        'tg-modal': '0 4px 24px rgba(0, 0, 0, 0.15)',
      },
      fontFamily: {
        sans: [
          'Roboto',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
