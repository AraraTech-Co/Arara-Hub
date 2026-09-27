'use client'

import { QUICK_LINKS } from '@/config/hub-modules'

export function QuickLinks() {
  if (QUICK_LINKS.length === 0) return null
  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Atalhos</h2>
      <div className="flex flex-wrap gap-3">
        {QUICK_LINKS.map((l) => (
          <a
            key={l.id}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {l.icon && <span aria-hidden>{l.icon}</span>}
            {l.label}
          </a>
        ))}
      </div>
    </div>
  )
}
