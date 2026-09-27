export type HubModule = {
  id: string
  /** slug do app na plataforma — usado no handoff SSO (/sso/criar app_slug) */
  slug: string
  label: string
  description: string
  icon: string
  color: string
  /** origem do app de destino; o Hub faz o handoff e abre com o código */
  url?: string
  /** papel do usuário NESTE app (vem da membership) */
  role?: string
  badge?: string
  available: boolean
}

export type Membership = { role: string; app: { slug: string; name: string } }

/** Metadados de apresentação por app conhecido. Apps sem entrada aqui ainda
 *  aparecem (usando o nome da membership), mas sem ícone/URL bonitos. */
const REGISTRY: Record<
  string,
  { label: string; description: string; icon: string; color: string; url?: string; order: number }
> = {
  'portal-suporte': {
    label: 'Suporte',
    description: 'Abertura e acompanhamento de chamados',
    icon: '🎫',
    color: '#4f46e5',
    url: 'https://suporte.arara-tech.com',
    order: 10,
  },
  'portal-crm': {
    label: 'CRM Vendas',
    description: 'Clientes, oportunidades e pipeline',
    icon: '💰',
    color: '#0891b2',
    url: 'https://crm.arara-tech.com',
    order: 20,
  },
  'time-management': {
    label: 'Gestão de Horas',
    description: 'Ponto, escala e apontamento',
    icon: '⏱️',
    color: '#d97706',
    url: 'https://suporte.arara-tech.com/horas',
    order: 30,
  },
  'portal-cursos': {
    label: 'Aprendizado',
    description: 'Cursos, treinamentos e materiais',
    icon: '🎓',
    color: '#059669',
    url: 'https://cursos.arara-tech.com',
    order: 40,
  },
  'portal-araratech': {
    label: 'AraraTech',
    description: 'Portal institucional e mission control',
    icon: '🛰️',
    color: '#7c3aed',
    url: 'https://arara-tech.com',
    order: 50,
  },
}

/** slugs que nunca viram card (o Hub em si, API-only, etc.) */
const HIDDEN = new Set(['arara-hub'])

/**
 * Monta a grade a partir das memberships do usuário: um card por app a que a
 * pessoa pertence. "Só permite ao que é destinado" — quem não tem membership
 * não vê o card.
 */
export function getHubModules(memberships: Membership[]): HubModule[] {
  const seen = new Set<string>()
  const modules: HubModule[] = []

  for (const m of memberships || []) {
    const slug = m.app?.slug
    if (!slug || HIDDEN.has(slug) || seen.has(slug)) continue
    seen.add(slug)
    const meta = REGISTRY[slug]
    modules.push({
      id: slug,
      slug,
      label: meta?.label ?? m.app?.name ?? slug,
      description: meta?.description ?? '',
      icon: meta?.icon ?? '📦',
      color: meta?.color ?? '#334155',
      url: meta?.url,
      role: m.role,
      available: true,
    })
  }

  return modules.sort(
    (a, b) => (REGISTRY[a.slug]?.order ?? 999) - (REGISTRY[b.slug]?.order ?? 999),
  )
}

export type QuickLink = { id: string; label: string; href: string; icon?: string }

export const QUICK_LINKS: QuickLink[] = [
  { id: 'site', label: 'Site AraraTech', href: 'https://arara-tech.com', icon: '🌐' },
  { id: 'api', label: 'Documentação da API', href: 'https://api.arara-tech.com/readme', icon: '📚' },
]
