'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Users, FileText, LayoutGrid, CalendarDays,
  Mail, Shield, Plug, Code, Settings, LogOut,
  Server,
  Menu, Headphones, MessageCircle, MessageSquare, BarChart2, Brain, History, Upload, BookOpen,
  AlertOctagon, Webhook, Building2, UsersRound, CalendarX2, TrendingUp, Zap,
  ChevronDown, ChevronRight, Layers, HeadphonesIcon, UserSearch, Users2,
  Database, ShieldCheck, Search, Store, FileCheck, Key, Receipt,
  PanelLeftClose, PanelLeftOpen, Workflow, Library, Monitor, FolderKanban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { GlobalSearch } from '@/components/admin/global-search'
import { useWaSinal } from '@/hooks/use-wa-sinal'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import type { SystemAccessLevel } from '@/lib/auth/types'
import { verify } from '@/lib/auth'
import type { FeatureGrant } from '@/lib/auth/feature-grants'
import { useAuth } from '@/lib/arara/AuthProvider'
import { clearAuth } from '@/lib/arara/auth-storage'
import { api } from '@/lib/api/client'

type AccessLevel = SystemAccessLevel

const ROLE_LABELS: Record<AccessLevel, string> = {
  master: 'Master',
  admin: 'Painel Admin',
  developer: 'Painel Desenvolvedor',
  user: 'Painel Usuário',
}

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  exact?: boolean
  /** Nível mínimo exigido para ver o item — mesmo vocabulário de config/access-control.json. */
  minLevel?: AccessLevel
  /**
   * Grant que também libera o item, ALÉM do nível. Ex.: o editor de fluxo é
   * `minLevel: admin`, mas quem tem o grant `wa_flow_editor` (mesmo developer) o vê.
   */
  grant?: FeatureGrant
  hidden?: boolean
}

type NavGroup = {
  id: string
  label: string
  icon: React.ElementType
  items: NavItem[]
  /** Nível mínimo exigido para ver o grupo inteiro. */
  minLevel?: AccessLevel
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    icon: Layers,
    items: [
      { href: '/admin',        label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/admin/kanban', label: 'Kanban',    icon: LayoutGrid },
      // Decisão revista em 20/08 (pedido do Leonardo): o quadro Dev aparece só
      // para quem TRABALHA nele — developer+ e quem tem o grant de QA. O
      // caminho do Suporte é o botão "Escalar para o Dev" no chamado; a trava
      // real de mover continua no servidor.
      { href: '/admin/kanban-dev', label: 'Kanban Dev', icon: LayoutGrid, minLevel: 'developer', grant: 'qa' },
      // Mesma régua do quadro Dev: quem trabalha nele. Planejar (criar projeto,
      // mexer em data) é outra coisa e exige admin ou o grant `planejamento` —
      // a trava real está no servidor, em cada rota do módulo `projetos`.
      { href: '/admin/projetos', label: 'Projetos', icon: FolderKanban, minLevel: 'developer', grant: 'qa' },
      { href: '/inbox',        label: 'WhatsApp',  icon: MessageSquare },
      { href: '/admin/whatsapp/flow', label: 'Fluxos do WhatsApp', icon: Workflow, minLevel: 'admin', grant: 'wa_flow_editor' },
      { href: '/admin/whatsapp-analytics', label: 'Desempenho WhatsApp', icon: TrendingUp, minLevel: 'admin' },
      { href: '/admin/doc-de-apoio', label: 'Doc de Apoio', icon: Library, minLevel: 'developer' },
    ],
  },
  {
    id: 'atendimento',
    label: 'Atendimento',
    icon: HeadphonesIcon,
    items: [
      { href: '/admin/public-tickets', label: 'Tickets Públicos',      icon: FileText },
      { href: '/admin/kb',             label: 'Base de Conhecimento',  icon: BookOpen },
      { href: '/admin/sla',            label: 'SLA',                   icon: Shield },
      { href: '/admin/sla-contracts',  label: 'Contratos SLA',         icon: Shield },
      { href: '/admin/incidents',      label: 'Incidentes',            icon: AlertOctagon },
      { href: '/admin/post-mortems',   label: 'Post-Mortems',          icon: AlertOctagon, hidden: true },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: UserSearch,
    items: [
      { href: '/admin/companies',       label: 'Empresas',       icon: Building2 },
      { href: '/admin/units',           label: 'Unidades',       icon: Store },
      { href: '/admin/users',           label: 'Usuários',       icon: Users, minLevel: 'admin' },
      { href: '/admin/validador-sped',  label: 'Validador SPED', icon: FileCheck },
      { href: '/admin/coleta-nfe-pdv',  label: 'Coleta de NFe PDV', icon: Receipt },
      // PROJETO PAUSADO em 21/08/2026 (decisão do Leonardo: não gastar energia
      // agora). `hidden` e não removido: retomar é apagar a palavra `hidden`.
      // O servidor RustDesk segue de pé no VPS sem custo (0% CPU, ~3 MB RAM) e
      // a chave continua no volume — nada precisa ser refeito.
      // Contexto e caminho de volta: docs/plans/plano-araradesk-cliente-proprio.md
      { href: '/admin/acesso-remoto',   label: 'Acesso Remoto',  icon: Monitor, hidden: true },
    ],
  },
  {
    id: 'equipe',
    label: 'Equipe',
    icon: Users2,
    items: [
      { href: '/admin/teams',         label: 'Times',    icon: UsersRound },
      { href: '/admin/team-members',  label: 'Membros',  icon: Users2,     minLevel: 'admin' },
      // Administra usuários de OUTRO sistema (o CRM). Master aqui é o mínimo
      // para ver; quem manda de verdade é o papel de admin DENTRO do CRM, e a
      // própria tela explica isso a quem não tiver.
      { href: '/admin/crm-usuarios', label: 'Usuários do CRM', icon: Building2, minLevel: 'master' },
      { href: '/admin/automation', label: 'Automações', icon: Zap, minLevel: 'admin' },
      { href: '/admin/schedule',   label: 'Escala',     icon: CalendarDays },
    ],
  },
  {
    id: 'recursos',
    label: 'Recursos',
    icon: Database,
    items: [
      { href: '/admin/reports',          label: 'Relatórios',           icon: BarChart2, minLevel: 'admin' },
      { href: '/admin/analytics',        label: 'Analytics',            icon: TrendingUp, minLevel: 'admin' },
      { href: '/admin/import',           label: 'Importar Trello',      icon: Upload, minLevel: 'admin', hidden: true },
      { href: '/admin/historico-trello', label: 'Histórico Trello',     icon: History, hidden: true },
      { href: '/admin/emails',           label: 'E-mails',              icon: Mail },
      { href: '/admin/sgc',              label: 'SGC Chat',             icon: MessageCircle },
      { href: '/admin/avisos-whatsapp', label: 'Avisos WhatsApp',      icon: MessageCircle },
      { href: '/admin/devops',           label: 'DevOps',               icon: Server },
    ],
  },
  {
    id: 'administracao',
    label: 'Administração',
    icon: ShieldCheck,
    minLevel: 'admin',
    items: [
      { href: '/admin/settings',      label: 'Configurações', icon: Settings, minLevel: 'master' },
      { href: '/admin/webhooks',      label: 'Webhooks',      icon: Webhook,    minLevel: 'admin', hidden: true },
      { href: '/admin/api-keys',      label: 'API Keys',      icon: Key,        minLevel: 'admin' },
      { href: '/admin/api-docs',      label: 'API Docs',      icon: Code,       minLevel: 'admin', hidden: true },
      { href: '/admin/ia',            label: 'IA',            icon: Brain,      minLevel: 'admin', hidden: true },
      { href: '/admin/integrations',  label: 'Integrações',   icon: Plug },
      { href: '/admin/permissions',   label: 'Permissões',    icon: Shield,     minLevel: 'master' },
      { href: '/admin/sla-calendar',  label: 'Cal. SLA',      icon: CalendarX2, hidden: true },
      { href: '/admin/audit',         label: 'Auditoria',     icon: Search,   minLevel: 'admin' },
    ],
  },
]

/** Lista achatada de todos os itens de navegação — usada para resolver label/ícone por href (ex.: atalhos recentes no dashboard). */
export const FLAT_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(group => group.items)

export function findNavItem(href: string): NavItem | undefined {
  return FLAT_NAV_ITEMS.find(item => item.href === href)
}

function NavItem({ item, pathname, onClick, collapsed }: {
  item: NavItem
  pathname: string
  onClick?: () => void
  collapsed?: boolean
}) {
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
  // O sinal do WhatsApp mora no item do WhatsApp. O gancho é chamado sempre
  // (regra dos hooks) e só trabalha quando é ESTE item — nos outros ele sai no
  // primeiro `if` e não consulta nada.
  const sinal = useWaSinal(item.href === '/inbox')
  // O distintivo conta CONVERSAS com mensagem nova, não conversas abertas nem
  // soma de mensagens. Conversa aberta e já lida não é pendência: contá-la
  // deixaria o número aceso o dia inteiro. Somar mensagens dava um número que
  // não batia com nada da tela (84 com 15 abertas) — conversa é a unidade.
  const contador = item.href === '/inbox' ? sinal.naoLidas : 0

  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? rotuloCompleto(item.label, contador, sinal.abertas) : undefined}
      className={cn(
        'relative flex items-center rounded-lg text-sm font-medium transition-all duration-150',
        collapsed
          ? 'justify-center px-0 py-2 w-full'
          : 'gap-3 px-3 py-2',
        isActive
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30'
          : 'text-muted-foreground hover:bg-white/[0.08] hover:text-white'
      )}
    >
      <span className="relative shrink-0">
        <item.icon className={cn('w-[17px] h-[17px]', isActive ? 'text-white' : 'text-muted-foreground')} />
        {/* Recolhido não cabe número: vira um ponto. Chegando algo, ele pulsa —
            é o aviso visual para quem está com a barra estreita. */}
        {collapsed && contador > 0 && (
          <span
            className={cn(
              'absolute -right-1 -top-1 h-2 w-2 rounded-full bg-sem-error-fg',
              sinal.novidade && 'animate-ping',
            )}
          />
        )}
      </span>

      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {contador > 0 && (
            <span
              className={cn(
                'ml-auto min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums transition-transform',
                isActive ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white',
                sinal.novidade && 'scale-110 ring-2 ring-indigo-400/60',
              )}
            >
              {contador > 99 ? '99+' : contador}
            </span>
          )}
        </>
      )}
    </Link>
  )
}

/** Texto do balão quando a barra está recolhida — o número precisa aparecer em algum lugar. */
function rotuloCompleto(label: string, naoLidas: number, abertas: number): string {
  const emAberto = abertas > 0 ? ` (${abertas} conversa${abertas > 1 ? 's' : ''} em aberto)` : ''
  if (!naoLidas) return `${label} — nada por ler${emAberto}`
  return `${label} — ${naoLidas} conversa${naoLidas > 1 ? 's' : ''} com mensagem nova${emAberto}`
}

function NavGroup({
  group,
  pathname,
  role,
  grants,
  defaultOpen,
  onNavClick,
  collapsed,
}: {
  group: NavGroup
  pathname: string
  role: AccessLevel | null
  grants: string[]
  defaultOpen: boolean
  onNavClick?: () => void
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    const hasActive = group.items.some(item =>
      item.exact ? pathname === item.href : pathname.startsWith(item.href)
    )
    if (hasActive) setOpen(true)
  }, [pathname, group.items])

  const visibleItems = group.items.filter(item => {
    if (item.hidden) return false
    // Visível por NÍVEL ou por GRANT — o grant libera individualmente uma função
    // que o nível não daria (ex.: editor de fluxo para um developer).
    const byLevel = !item.minLevel || (!!role && verify(item.minLevel, { role }))
    const byGrant = !!item.grant && grants.includes(item.grant)
    if (!byLevel && !byGrant) return false
    return true
  })

  if (visibleItems.length === 0) return null

  const hasActive = group.items.some(item =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)
  )

  // Collapsed: show all items as icon-only, no group header
  if (collapsed) {
    return (
      <div className="mb-1 space-y-0.5 px-1">
        {visibleItems.map(item => (
          <NavItem key={item.href} item={item} pathname={pathname} onClick={onNavClick} collapsed />
        ))}
        <div className="mx-auto w-6 border-t border-white/[0.06] my-1" />
      </div>
    )
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-150',
          hasActive
            ? 'text-indigo-400'
            : 'text-muted-foreground hover:text-muted-foreground'
        )}
      >
        <group.icon className="w-[14px] h-[14px] shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        {open
          ? <ChevronDown className="w-3 h-3" />
          : <ChevronRight className="w-3 h-3" />
        }
      </button>

      {open && (
        <div className="mt-0.5 pl-2 space-y-0.5">
          {visibleItems.map(item => (
            <NavItem key={item.href} item={item} pathname={pathname} onClick={onNavClick} />
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarContent({
  pathname,
  role,
  grants,
  onNavClick,
  collapsed,
  onToggle,
}: {
  pathname: string
  role: AccessLevel | null
  grants: string[]
  onNavClick?: () => void
  collapsed?: boolean
  onToggle?: () => void
}) {
  async function handleLogout() {
    clearAuth()
    window.location.href = '/auth/login'
  }

  const visibleGroups = NAV_GROUPS.filter(group => {
    if (group.minLevel && (!role || !verify(group.minLevel, { role }))) return false
    return true
  })

  function getRoleLabel(r: AccessLevel | null) {
    if (!r) return 'Painel Admin'
    return ROLE_LABELS[r] ?? 'Painel Admin'
  }

  return (
    <div className="flex flex-col h-full bg-sidebar text-white">
      {/* Logo + toggle */}
      <div className={cn(
        'flex items-center border-b border-white/[0.08]',
        collapsed ? 'justify-center px-2 py-4' : 'gap-2.5 px-4 py-5'
      )}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            {/* O logotipo da Arara, não um ícone de biblioteca dentro de um
                quadrado colorido. Vetor: a 32px o PNG de 182px chegava
                reamostrado, e o disco branco do meio — 2px aqui — borrava. */}
            <img src="/marca/araratech-icon.svg" alt="Arara Tech" width={32} height={32}
                 className="h-8 w-8 shrink-0 object-contain" />
            {onToggle && (
              <button
                onClick={onToggle}
                title="Expandir menu"
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <>
            {/* O logotipo da Arara, não um ícone de biblioteca dentro de um
                quadrado colorido. Vetor: a 32px o PNG de 182px chegava
                reamostrado, e o disco branco do meio — 2px aqui — borrava. */}
            <img src="/marca/araratech-icon.svg" alt="Arara Tech" width={32} height={32}
                 className="h-8 w-8 shrink-0 object-contain" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">Portal Suporte</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{getRoleLabel(role)}</p>
            </div>
            {onToggle && (
              <button
                onClick={onToggle}
                title="Recolher menu"
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Global Search — hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 py-2 border-b border-white/[0.08]">
          <GlobalSearch />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin" style={{ paddingLeft: collapsed ? 0 : undefined, paddingRight: collapsed ? 0 : undefined }}>
        <div className={collapsed ? '' : 'px-3'}>
          {visibleGroups.map((group, i) => (
            <NavGroup
              key={group.id}
              group={group}
              pathname={pathname}
              role={role}
              grants={grants}
              defaultOpen={i === 0}
              onNavClick={onNavClick}
              collapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-white/[0.08] space-y-1', collapsed ? 'px-1 py-3 flex flex-col items-center' : 'px-3 py-3')}>
        {/* Avisos: fica na casca, e não num cabeçalho de página, porque a
            barra lateral é a única coisa presente em toda tela do portal —
            foi justamente por morar num cabeçalho que o sino sumiu antes. */}
        {/* Voltar ao Hub — troca de sistema sem usar o voltar do navegador */}
        <a
          href="https://hub.arara-tech.com"
          title={collapsed ? 'Voltar ao Hub' : undefined}
          className={cn(
            'flex items-center rounded-lg text-sm font-medium text-muted-foreground hover:bg-white/[0.08] hover:text-white transition-all duration-150',
            collapsed ? 'justify-center w-10 h-10' : 'gap-3 w-full px-3 py-2.5'
          )}
        >
          <LayoutGrid className="w-[18px] h-[18px]" />
          {!collapsed && 'Voltar ao Hub'}
        </a>
        <NotificationBell collapsed={collapsed} />
        <ThemeToggle
          iconOnly={collapsed}
          className={collapsed ? 'w-10 h-10' : undefined}
          colorClassName="hover:bg-sidebar-accent text-sidebar-muted-foreground hover:text-sidebar-foreground"
        />
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sair' : undefined}
          className={cn(
            'flex items-center rounded-lg text-sm font-medium text-muted-foreground hover:bg-white/[0.08] hover:text-red-400 transition-all duration-150',
            collapsed ? 'justify-center w-10 h-10' : 'gap-3 w-full px-3 py-2.5'
          )}
        >
          <LogOut className="w-[18px] h-[18px]" />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </div>
  )
}

export function AdminSidebar({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean
  onToggle?: () => void
}) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [role, setRole] = useState<AccessLevel | null>(null)
  const [grants, setGrants] = useState<string[]>([])

  // Nível do portal vem do Profile (master/admin/developer); fallback = roles da platform JWT.
  useEffect(() => {
    let active = true

    function fromPlatformRoles(): AccessLevel | null {
      const roles = user?.roles || []
      if (roles.includes('master')) return 'master'
      if (roles.includes('admin')) return 'admin'
      if (roles.includes('developer')) return 'developer'
      if (roles.length) return 'user'
      return null
    }

    setRole(fromPlatformRoles())

    if (!user?.id && !user?.email) return () => { active = false }

    api
      .get<{ data?: Array<Record<string, unknown>>; count?: number } | Array<Record<string, unknown>>>(
        '/api/profiles',
      )
      .then((res) => {
        if (!active) return
        const rows = Array.isArray(res) ? res : res?.data || []
        const mine =
          rows.find((p) => p.id === user?.id) ||
          rows.find((p) => String(p.email || '').toLowerCase() === String(user?.email || '').toLowerCase())
        if (!mine) return
        const profileRole = String(mine.role || '') as AccessLevel
        if (['master', 'admin', 'developer', 'user'].includes(profileRole)) {
          setRole(profileRole)
        }
        const fg = mine.feature_grants ?? mine.featureGrants
        if (Array.isArray(fg)) setGrants(fg.map(String))
      })
      .catch(() => {
        /* mantém fallback da platform */
      })

    return () => {
      active = false
    }
  }, [user?.id, user?.email, user?.roles])

  return (
    <>
      {/* Desktop sidebar - fixed, width transitions between collapsed (w-16) and expanded (w-64) */}
      <aside
        className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col z-50 transition-[width] duration-300"
        style={{ width: collapsed ? '4rem' : '16rem' }}
      >
        <SidebarContent pathname={pathname ?? ''} role={role} grants={grants} collapsed={collapsed} onToggle={onToggle} />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <img src="/marca/araratech-icon.svg" alt="Arara Tech" width={28} height={28}
               className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold text-white">Portal Suporte</span>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-0">
            <SidebarContent pathname={pathname ?? ''} role={role} grants={grants} onNavClick={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
