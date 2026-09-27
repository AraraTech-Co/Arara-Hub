import { Suspense } from 'react'
import ClientPage from './client'

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Entrando…</div>}>
      <ClientPage />
    </Suspense>
  )
}
