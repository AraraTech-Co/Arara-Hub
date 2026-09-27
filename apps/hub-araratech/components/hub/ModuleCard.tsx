'use client'

import { useState } from 'react'
import { arara } from '@/lib/arara'
import type { HubModule as HubModuleType } from '@/config/hub-modules'

export function ModuleCard({ module }: { module: HubModuleType }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const disabled = !module.available || busy

  async function open() {
    setErr('')
    if (!module.available) return
    // Sem destino externo: nada a abrir (v1).
    if (!module.url || !module.slug) return
    setBusy(true)
    try {
      // Handoff SSO: gera o código, guarda o JWT no servidor, redireciona.
      const codigo = await arara.ssoHandoff(module.slug)
      // Contrato padrão de handoff: rota real /sso/?c= (path, não hash) — funciona
      // igual em apps Next (rota) e Vite (SPA fallback). Ver docs/SSO-HANDOFF.md.
      window.location.href = `${module.url}/sso/?c=${encodeURIComponent(codigo)}`
    } catch (e) {
      // Se o handoff falhar, abre o app mesmo assim (ele pede login).
      setErr((e as Error).message)
      window.location.href = module.url
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      className={`group text-left rounded-2xl border border-slate-200 bg-white p-5 transition
        ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md hover:-translate-y-0.5'}`}
      style={{ borderTopColor: module.color, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between">
        <div
          className="h-11 w-11 rounded-xl grid place-items-center text-2xl"
          style={{ background: `${module.color}14` }}
          aria-hidden
        >
          {module.icon}
        </div>
        {(module.badge || module.role) && (
          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 capitalize">
            {module.badge || module.role}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">{module.label}</h3>
      <p className="text-sm text-slate-500 mt-1">{module.description}</p>
      {busy && <p className="text-xs text-slate-400 mt-2">Entrando…</p>}
      {err && <p className="text-xs text-amber-600 mt-2">Abrindo sem sessão…</p>}
    </button>
  )
}
