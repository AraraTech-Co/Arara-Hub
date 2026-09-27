"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

const TIPOS = [
  { value: "", label: "Todos" },
  { value: "lead", label: "Leads" },
  { value: "cliente", label: "Clientes" },
]

/** Busca ao-vivo (debounce) + filtro de tipo — atualiza a URL sem reload. */
export function ClientesFilters({ initialQ, initialTipo }: { initialQ: string; initialTipo: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = useState(initialQ)
  const [tipo, setTipo] = useState(initialTipo)
  const firstRender = useRef(true)

  function buildUrl(nextQ: string, nextTipo: string) {
    const params = new URLSearchParams()
    if (nextQ.trim()) params.set("q", nextQ.trim())
    if (nextTipo) params.set("tipo", nextTipo)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  // Debounce da busca por texto
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const t = setTimeout(() => router.replace(buildUrl(q, tipo)), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function selectTipo(next: string) {
    setTipo(next)
    router.replace(buildUrl(q, next))
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou empresa..."
          aria-label="Buscar clientes"
          className="w-full pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
        />
      </div>

      <div className="flex gap-2 shrink-0">
        {TIPOS.map((opt) => {
          const isActive = tipo === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => selectTipo(opt.value)}
              className={`px-4 rounded-lg text-sm font-medium border min-h-[44px] ${
                isActive
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
