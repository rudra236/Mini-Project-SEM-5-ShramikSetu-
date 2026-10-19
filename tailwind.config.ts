import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // High-contrast Neo-brutalist palette inspired by iet-ipl-2026
        stadium: {
          ink: '#0F172A',
          card: '#FFFFFF',
          canvas: '#F8FAFC',
          amber: '#F59E0B',
          amberDark: '#B45309',
          lightAmber: '#FEF3C7',
          slateBorder: '#1E293B',
          slateLight: '#E2E8F0',
          ctaRed: '#DC2626',
          pitchGreen: '#14532D',
          turf: '#15803D',
          blue: '#1D4ED8',
          blueLight: '#DBEAFE',
        },
        // Core application semantic aliases
        ink: '#0F172A',
        paper: '#F8FAFC',
        'paper-dark': '#E2E8F0',
        yellow: '#F59E0B',
        orange: '#EA580C',
        blue: '#1D4ED8',
        green: '#15803D',
        // Semantic status tokens
        'status-pending': '#EA580C',
        'status-verified': '#15803D',
        'status-rejected': '#DC2626',
        'status-review': '#B45309',
        'status-compliant': '#15803D',
      },
      fontFamily: {
        sans: ['var(--font-space)', 'Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
        body: ['var(--font-space)', 'Space Grotesk', 'system-ui', 'sans-serif'],
        data: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
        id: ['var(--font-tiro)', 'serif'],
      },
      boxShadow: {
        'brutal-sm': '2px 2px 0px #0F172A',
        'brutal': '3px 3px 0px #0F172A',
        'brutal-lg': '4px 4px 0px #0F172A',
        'brutal-xl': '6px 6px 0px #0F172A',
      },
      borderRadius: {
        'none': '0',
        'sm': '2px',
        'badge': '2px',
        DEFAULT: '2px',
        'md': '4px',
        'lg': '6px',
      },
      spacing: {
        'touch': '48px',
      },
      minHeight: {
        'touch': '48px',
      },
      minWidth: {
        'touch': '48px',
      },
    },
  },
  plugins: [],
};

export default config;

