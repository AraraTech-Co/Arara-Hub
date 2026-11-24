'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/lib/arara'

/**
 * Mostra o conteúdo só para quem pode gravar. Perfil "leitura" não vê
 * (ou vê `seLeitura`, quando passado). O servidor recusa de qualquer jeito.
 */
export function SoQuemGrava({ children, seLeitura = null }: { children: ReactNode; seLeitura?: ReactNode }) {
  const { somenteLeitura } = useAuth()
  return <>{somenteLeitura ? seLeitura : children}</>
}

export function AvisoSomenteLeitura() {
  return (
    <div role="status" className="max-w-xl rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
      Seu acesso ao CRM é somente leitura: dá para consultar tudo, mas não cadastrar nem alterar.
    </div>
  )
}
