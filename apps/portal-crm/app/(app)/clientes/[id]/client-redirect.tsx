'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ClienteIdRedirect() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')

  useEffect(() => {
    if (id && id !== '_') router.replace(`/clientes/view?id=${id}`)
    else router.replace('/clientes')
  }, [id, router])

  return <p className="text-sm text-gray-500">Redirecionando…</p>
}
