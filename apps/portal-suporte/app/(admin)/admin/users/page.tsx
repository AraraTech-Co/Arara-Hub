'use client'

import { UsersManager } from '@/components/admin/users-manager'

/**
 * Usuários (clientes). A gestão completa — criar, editar, senha, convites,
 * códigos de recuperação — vive no UsersManager, que consome a plataforma via
 * `usersApi` (/api/* → /v1/r/portal-suporte/*).
 */
export default function UsersPage() {
  return <UsersManager audience="client" />
}
