import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono, Noto_Sans_Devanagari } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jetbrains',
  display: 'swap',
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['500', '700'],
  variable: '--font-tiro',
  display: 'swap',
});

export const viewport: import('next').Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0F172A',
};

export const metadata: Metadata = {
  title: 'ShramikSetu — National Wage & Employment Ledger',
  description: 'Digital contracts, geo-fenced attendance, and transparent wage records for daily-wage workers and contractors.',
  keywords: 'shramiksetu, labour, daily wage, worker, contractor, attendance, India',
  authors: [{ name: 'ShramikSetu' }],
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.svg',
    apple: '/icon-192.svg',
  },
  openGraph: {
    title: 'ShramikSetu — National Wage & Employment Ledger',
    description: 'Transparent, tamper-evident employment records for informal workers and contractors.',
    type: 'website',
  },
};

import { AuthProvider } from '@/lib/auth-context';
import { PwaRegister } from '@/components/PwaRegister';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`scroll-smooth ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${notoDevanagari.variable}`}
    >
      <body className="font-sans antialiased bg-[#F8FAFC] text-[#0F172A] min-h-screen selection:bg-[#FEF3C7] selection:text-[#0F172A]">
        <AuthProvider>
          <PwaRegister />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

