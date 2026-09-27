'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toast, type ToastState } from '@/components/crm/Toast'
import { arara } from '@/lib/arara'

export function DealActions({ dealId }: { dealId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<'won' | 'lost' | null>(null)
  const [toast, setToast] = useState<ToastState>(null)

  async function markAs(status: 'won' | 'lost') {
    setLoading(status)
    try {
      await arara.patchDeal(dealId, { status, closedAt: new Date().toISOString() })
      router.push(status === 'won' ? '/historico-vendas' : '/pipeline')
    } catch {
      setToast({
        message: 'Não foi possível atualizar a negociação. Tente novamente.',
        type: 'error',
      })
      setLoading(null)
    }
  }

  return (
    <>
      <div className="flex gap-3">
        <button
          onClick={() => markAs('won')}
          disabled={loading !== null}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium text-sm py-3 rounded-lg transition-colors min-h-[44px]"
        >
          {loading === 'won' ? 'Salvando…' : 'Marcar como Ganho ✓'}
        </button>
        <button
          onClick={() => markAs('lost')}
          disabled={loading !== null}
          className="flex-1 bg-red-100 hover:bg-red-200 disabled:opacity-60 text-red-700 font-medium text-sm py-3 rounded-lg transition-colors min-h-[44px]"
        >
          {loading === 'lost' ? 'Salvando…' : 'Marcar como Perdido ✗'}
        </button>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}
