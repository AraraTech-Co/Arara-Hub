'use client'

import { Suspense } from 'react'
import ClientesPageInner from './clientes-inner'

export default function ClientesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Carregando…</p>}>
      <ClientesPageInner />
    </Suspense>
  )
}
