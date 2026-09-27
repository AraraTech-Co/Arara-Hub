'use client'

import { UsersManager } from '@/components/admin/users-manager'

/**
 * Membros da equipe. Mesma gestão dos usuários, com `audience="team"` — é o que
 * troca os campos de cliente (empresa/unidade) pelos de equipe (função) e
 * expõe as permissões extras por pessoa.
 */
export default function TeamMembersPage() {
  return <UsersManager audience="team" />
}
