'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'

/** Client dashboard ticket detail → same Arara ticket view as admin. */
export default function ClientTicketPage() {
  const router = useRouter()
  const id = useRotaDinamica('id', 'tickets')

  useEffect(() => {
    if (!id || id === '_') return
    router.replace(`/admin/tickets/view?id=${encodeURIComponent(id)}`)
  }, [id, router])

  return <div className="p-6 text-sm text-muted-foreground">Abrindo ticket…</div>
}
