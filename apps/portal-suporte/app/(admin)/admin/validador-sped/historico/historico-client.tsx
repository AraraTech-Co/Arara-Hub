'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

const STATUS_BADGE: Record<string, string> = {
  APROVADO: 'bg-sem-success text-sem-success-fg',
  COM_AVISOS: 'bg-sem-warning text-sem-warning-fg',
  COM_ERROS: 'bg-orange-100 text-orange-700',
  REPROVADO: 'bg-sem-error text-sem-error-fg',
}

interface Item {
  id: string
  cnpj: string
  periodo: string
  cod_ver: string
  status: string
  total_erros: number
  total_avisos: number
  created_at: string
}

interface Props {
  items: Item[]
  error?: string
  limit: number
  offset: number
  cnpjFilter?: string
}

export function HistoricoClient({ items, error, limit, offset, cnpjFilter }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState(cnpjFilter ?? '')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search.trim()) params.set('cnpj', search.trim().replace(/\D/g, ''))
    params.set('limit', String(limit))
    params.set('offset', '0')
    router.push(`/admin/validador-sped/historico?${params}`)
  }

  const handlePage = (newOffset: number) => {
    const params = new URLSearchParams()
    if (cnpjFilter) params.set('cnpj', cnpjFilter)
    params.set('limit', String(limit))
    params.set('offset', String(newOffset))
    router.push(`/admin/validador-sped/historico?${params}`)
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar por CNPJ..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          Buscar
        </button>
        {cnpjFilter && (
          <button
            type="button"
            onClick={() => { setSearch(''); router.push('/admin/validador-sped/historico') }}
            className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted/50"
          >
            Limpar
          </button>
        )}
      </form>

      {error && (
        <div className="text-sm text-sem-error-fg bg-sem-error border border-sem-error-bd rounded-lg px-4 py-3">
          {error === 'Serviço não configurado'
            ? 'O serviço de validação SPED ainda não está configurado neste ambiente.'
            : error}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">CNPJ</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Período</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Erros</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Avisos</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Data</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground/70">
                  {cnpjFilter ? `Nenhuma validação encontrada para o CNPJ ${cnpjFilter}` : 'Nenhuma validação registrada ainda.'}
                </td>
              </tr>
            )}
            {items.map(item => (
              <tr key={item.id} className="border-t border-border/50 hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-foreground/80">{item.cnpj || '–'}</td>
                <td className="px-4 py-3 text-foreground/60">{item.periodo || '–'}</td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    STATUS_BADGE[item.status] ?? 'bg-muted text-muted-foreground',
                  )}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-sem-error-fg">
                  {item.total_erros > 0 ? item.total_erros.toLocaleString('pt-BR') : '–'}
                </td>
                <td className="px-4 py-3 text-right font-medium text-yellow-600">
                  {item.total_avisos > 0 ? item.total_avisos.toLocaleString('pt-BR') : '–'}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatDate(item.created_at, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => router.push(`/admin/validador-sped/_/?id=${encodeURIComponent(item.id)}`)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    Ver <ExternalLink className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {offset > 0 || items.length === limit
            ? `Exibindo ${offset + 1}–${offset + items.length}`
            : `${items.length} resultado${items.length !== 1 ? 's' : ''}`}
        </span>
        <div className="flex gap-2">
          <button
            disabled={offset === 0}
            onClick={() => handlePage(Math.max(0, offset - limit))}
            className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg disabled:opacity-30 hover:bg-muted/50"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <button
            disabled={items.length < limit}
            onClick={() => handlePage(offset + limit)}
            className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg disabled:opacity-30 hover:bg-muted/50"
          >
            Próxima <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
