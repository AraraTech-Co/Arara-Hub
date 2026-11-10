'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { arara } from '@/lib/arara'
import { ClienteForm, type ClienteValores } from '../cliente-form'

function EditarClienteInner() {
  const router = useRouter()
  const id = useSearchParams().get('id') || ''
  const [cliente, setCliente] = useState<ClienteValores | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) {
      setError('Cliente não informado')
      setLoading(false)
      return
    }
    let cancelled = false
    arara
      .client(id)
      .then((c) => {
        if (!cancelled) setCliente(c)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <p className="text-sm text-gray-500">Carregando…</p>
  if (error || !cliente) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error || 'Cliente não encontrado'}
      </div>
    )
  }

  const voltar = `/clientes/view?id=${encodeURIComponent(id)}`

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 mb-1">
        <Link href={voltar} className="text-sm text-gray-500 hover:text-gray-700">
          {String(cliente.name)}
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-900">Editar</span>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Editar cliente</h1>
      <ClienteForm
        inicial={cliente}
        rotuloSalvar="Salvar alterações"
        salvar={async (body) => {
          await arara.patchClient(id, body)
          router.push(voltar)
        }}
        cancelar={() => router.push(voltar)}
      />
    </div>
  )
}

export default function EditarClientePage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Carregando…</p>}>
      <EditarClienteInner />
    </Suspense>
  )
}
