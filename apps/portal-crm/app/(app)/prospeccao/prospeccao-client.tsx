"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Toast, type ToastState } from "@/components/crm/Toast"
import { clientTypeLabels, clientTypeBadgeClass } from "@/lib/labels"
import { arara } from "@/lib/arara"

type Lead = {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  type: "lead" | "cliente"
  tags: string[]
  source: string | null
  createdAt: string
}

export function ProspeccaoList({ initialLeads }: { initialLeads: Lead[] }) {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [query, setQuery] = useState("")
  const [claiming, setClaiming] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return leads
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [leads, query])

  async function pegar(lead: Lead) {
    setClaiming(lead.id)
    try {
      await arara.claimLead(lead.id)
      setLeads((prev) => prev.filter((l) => l.id !== lead.id))
      setToast({ message: `${lead.name} agora é seu. Bom contato!`, type: "success" })
    } catch (err) {
      setLeads((prev) => prev.filter((l) => l.id !== lead.id))
      setToast({
        message: err instanceof Error ? err.message : "Este lead já foi pego.",
        type: "error",
      })
    } finally {
      setClaiming(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, cidade ou ramo…"
            aria-label="Buscar leads"
            className="w-full h-11 pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-sm text-gray-500 shrink-0">{filtered.length} no pool</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-sm font-medium text-gray-700">Pool vazio</p>
          <p className="text-xs text-gray-500">Nenhum lead disponível para pegar no momento.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {filtered.map((lead) => (
            <div key={lead.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-semibold text-sm shrink-0">
                {lead.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">{lead.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${clientTypeBadgeClass[lead.type]}`}>
                    {clientTypeLabels[lead.type]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                  {lead.company && <span>{lead.company}</span>}
                  {lead.phone && <span>{lead.phone}</span>}
                  {lead.tags.slice(0, 3).map((t) => (
                    <span key={t} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => pegar(lead)}
                disabled={claiming !== null}
                className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 rounded-lg transition-colors inline-flex items-center min-h-[44px]"
              >
                {claiming === lead.id ? "Pegando…" : "Pegar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
