'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function PipelineIdRedirect() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')

  useEffect(() => {
    if (id && id !== '_') router.replace(`/pipeline/view?id=${id}`)
    else router.replace('/pipeline')
  }, [id, router])

  return <p className="text-sm text-gray-500">Redirecionando…</p>
}
