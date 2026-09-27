# Plano — Separar Membros (equipe) de Usuários (clientes) + corrigir bug /admin/users

## Context

Dois ajustes acoplados no painel admin (o terceiro pedido — auto-fechar após 7 dias — foi
**adiado** pelo usuário; exige criar um agendador de cron que hoje não existe).

1. **Bug `/admin/users` → Dashboard**: `config/access-control.json` exigia `master` para
   `/admin/users`, enquanto o menu mostrava "Usuários" para `admin` (`adminOnly`).
   O middleware derrubava quem não era `master` → redirecionava para `/admin` (dashboard).
2. **Separar pessoas**: `/admin/users` listava **todos** os perfis (equipe + clientes).
   Separado em **Equipe > Membros** (master/admin/developer) e **Clientes > Usuários** (`role='user'`).

## Mudanças realizadas

### A — config/access-control.json
- `/admin/users` `minLevel` `master` → **`admin`**
- `/api/admin/users/**` `minLevel` `master` → **`admin`**
- Nova regra `{ "pattern": "/admin/team-members", "minLevel": "admin" }`

### B — Componente compartilhado + 2 telas
- **Novo** `app/_components/admin/users-manager.tsx`: `audience: 'team' | 'client'`
  - `client`: lista `role === 'user'`, cria com role fixo `user`, mostra empresa/unidade
  - `team`: lista `role !== 'user'`, cria developer/admin, oculta empresa/unidade, mostra invite codes + recovery
- `app/(admin)/admin/users/page.tsx` → casca: `<UsersManager audience="client" />`
- **Novo** `app/(admin)/admin/team-members/page.tsx` → `<UsersManager audience="team" />`
- `app/_components/admin/admin-sidebar.tsx`: link "Membros" adicionado em Equipe (após Times)

## Status
Implementado e build OK (2026-06-23). Zero migrations necessárias.
