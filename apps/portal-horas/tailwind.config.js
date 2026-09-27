/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tokens compartilhados Arara (cânone: portal-crm / portal-suporte)
        surface: {
          DEFAULT: 'var(--c-surface)',
          card: 'var(--c-card)',
        },
        ink: {
          DEFAULT: 'var(--c-ink)',
          muted: 'var(--c-ink-muted)',
        },
        // Marca: indigo-600 (era blue-600)
        accent: {
          DEFAULT: '#4F46E5', // indigo-600
          hover: '#4338CA', // indigo-700
        },
        // Aliases shadcn-like para paridade com os portais irmãos
        primary: {
          DEFAULT: '#4F46E5',
          foreground: '#FFFFFF',
        },
        card: 'var(--c-card)',
        border: 'var(--c-border)',
        ring: '#6366F1', // indigo-500
        'muted-foreground': 'var(--c-ink-muted)',
        destructive: '#DC2626', // red-600
        success: '#059669', // emerald-600
        warning: '#D97706', // amber-600
        sidebar: {
          DEFAULT: '#17181F',
          foreground: '#E9E9EE',
          border: '#2A2D38',
          muted: '#9AA0AE',
          accent: '#22252F',
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
