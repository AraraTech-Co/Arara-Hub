'use client'

import { AuthProvider } from '@/lib/arara/AuthProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
