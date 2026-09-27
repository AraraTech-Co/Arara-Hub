import Link from "next/link"

const TABS = [
  { href: "/configuracoes/usuarios", label: "Usuários" },
  { href: "/configuracoes/equipes", label: "Equipes" },
  { href: "/configuracoes/funil", label: "Funil" },
  { href: "/configuracoes/metas", label: "Metas" },
]

export function ConfigTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-2 text-sm">
      {TABS.map((tab) => {
        const isActive = tab.href === active
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-1.5 rounded-lg border transition-colors ${
              isActive
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
