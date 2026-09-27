# Pedido ao Hefler — API de `AppMembership`

**Data:** 28/08/2026 · **De:** Leonardo
**Status do Hub:** no ar em `https://hub.arara-tech.com` (obrigado pelo DNS e pelo certificado)

---

## O problema em uma frase

**Não existe nenhuma forma de conceder a alguém o acesso a um app.** A tabela
`AppMembership` existe e o login devolve as memberships de quem entra — mas não há rota
para listar, conceder ou revogar. Sondado em 27/08:

```
GET /v1/apps/portal-suporte/members       → 404 Route not found
GET /v1/apps/portal-suporte/memberships   → 404 Route not found
GET /v1/memberships                       → 404 Route not found
GET /v1/users                             → 404 Route not found
```

O `/readme` (§ Membership) documenta a tabela: *"`AppMembership` liga `users.id` ↔ app.
Staff core deve ter membership em todas as apps relevantes."* Só falta o caminho para
administrá-la.

## Por que isso trava duas coisas hoje

**1. O Hub.** A grade de sistemas é construída a partir de `memberships`. Sem API, ninguém
consegue liberar um sistema para uma pessoa nova — ela loga e vê a tela vazia, e não há o
que fazer a respeito.

**2. A administração de usuários do CRM** (no ar desde 26/08, dentro do Portal de
Suporte). Ela cria o `portal-crm-Profile` — a pessoa aparece na equipe do CRM — mas **não
cria membership**, porque não há rota. Resultado: a pessoa existe no CRM e não vê o card
do CRM no Hub. Perfil e acesso ficam separados, e só um dos dois é administrável.

## O que precisamos

Três rotas, no vocabulário que o `/readme` já usa (`AppMembership.role` com os papéis
canônicos `user | support | developer | admin`):

| Método | Rota | Auth | Comportamento |
|---|---|---|---|
| `GET` | `/v1/apps/:slug/members` | JWT admin do app | lista `{ userId, email, name, role }` |
| `POST` | `/v1/apps/:slug/members` | JWT admin do app | concede: `{ userId, role }` |
| `DELETE` | `/v1/apps/:slug/members/:userId` | JWT admin do app | revoga |

Se preferir outro desenho — por exemplo `PATCH /v1/users/:id/memberships` — serve igual.
O que importa é existir um caminho para **conceder** e **revogar**, e um para **listar**.

**Uma dúvida junta:** hoje, quando alguém é criado por `POST /v1/auth/register`, ele nasce
com membership em algum app? Pelo que vejo no Hub, não — mas vale confirmar, porque muda
o que o portal precisa fazer depois de criar uma conta.

## Enquanto não existir

O Hub funciona para quem já tem membership, e mostra uma tela explicando a situação para
quem não tem — em vez de uma página em branco que parece defeito. Não é bloqueio para o
Hub existir; é bloqueio para **incluir gente nova**.

---

## Um segundo item, pequeno: revogar chave de API

Cunhar uma chave nova (`POST /v1/apps/:slug/keys`) **não invalida a anterior** — as duas
seguem valendo. E listar/revogar exige JWT de usuário:

```
GET /v1/apps/arara-hub/keys  (com a própria chave do app)
→ 403 "Only user JWT can list API keys"
```

Não é um problema seu para resolver — só quero confirmar que existe `DELETE
/v1/apps/:slug/keys/:id` com JWT, para que uma chave exposta possa ser de fato
aposentada. Se o caminho for outro, me diga qual.
