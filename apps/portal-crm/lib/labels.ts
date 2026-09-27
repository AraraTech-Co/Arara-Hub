/**
 * Fonte única de rótulos, cores e badges de domínio.
 * Antes espalhados/duplicados em várias telas (activityLabels x4, roleBadge x2, etc.).
 */

// ── Atividades ──
export const activityLabels: Record<string, string> = {
  call: "Ligação",
  visit: "Visita",
  email: "E-mail",
  meeting: "Reunião",
  follow_up: "Follow-up",
}

// ── Perfil de acesso (role) ──
export const roleLabels: Record<string, string> = {
  user: "Usuário",
  support: "Suporte",
  developer: "Developer",
  admin: "Admin",
  // legacy aliases (display)
  vendedor: "Usuário",
  gerente: "Admin",
}

export const roleBadgeClass: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  developer: "bg-violet-100 text-violet-700",
  support: "bg-blue-100 text-blue-700",
  user: "bg-gray-100 text-gray-700",
  gerente: "bg-red-100 text-red-700",
  vendedor: "bg-gray-100 text-gray-700",
}

// ── Função (StaffPosition) ──
export const positionLabels: Record<string, string> = {
  vendedor_externo: "Vendedor externo",
  vendedor_interno: "Vendedor interno",
  gerente_comercial: "Gerente comercial",
  diretor: "Diretor",
}

// ── Tipo de cliente ──
export const clientTypeLabels: Record<string, string> = {
  lead: "Lead",
  cliente: "Cliente",
}

export const clientTypeBadgeClass: Record<string, string> = {
  lead: "bg-amber-100 text-amber-700",
  cliente: "bg-green-100 text-green-700",
}

// ── Status de negociação (deal) ──
export const dealStatusLabels: Record<string, string> = {
  open: "Aberto",
  won: "Ganho",
  lost: "Perdido",
}

export const dealStatusBadgeClass: Record<string, string> = {
  open: "bg-indigo-100 text-indigo-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-600",
}

/** cor textual do status (para listas compactas) */
export const dealStatusTextClass: Record<string, string> = {
  open: "text-gray-400",
  won: "text-green-600",
  lost: "text-red-500",
}
