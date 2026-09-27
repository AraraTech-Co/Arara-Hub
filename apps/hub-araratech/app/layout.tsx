import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/arara'

export const metadata: Metadata = {
  title: 'Arara Hub',
  description: 'Porta de entrada da Arara — seus sistemas num só lugar.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
