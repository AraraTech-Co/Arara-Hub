# SSO Handoff — entrar já logado a partir do Arara Hub

Contrato único de "entra já logado" entre o Arara Hub e os apps de destino.

## Fluxo

1. No Hub, ao clicar num card, `arara.ssoHandoff(slug)` gera um código de uso
   único de 256 bits e o registra em `POST /v1/r/arara-hub/sso/criar` (exige o
   JWT de quem clicou; guarda o token por **30s**).
2. O Hub redireciona para o app de destino no **contrato padrão**:

   ```
   {url_do_app}/sso/?c=<id.verificador>
   ```

   Rota **real** (path, não hash): funciona igual em apps Next (rota física) e
   Vite (SPA fallback serve o index.html em qualquer sub-rota).
3. O app de destino, **antes de exigir sessão**, troca o código pelo token:

   ```
   POST /v1/r/arara-hub/sso/trocar?token=arara-hub-troca-publica
   body: { "codigo": "<id.verificador>" }
   → { success, token, app_slug }
   ```

   A rota é pública, mas exige o **token de webhook** `arara-hub-troca-publica`
   na query. Ele não é segredo (viaja no bundle); quem autentica de fato é o
   código de uso único, que **morre na leitura** (troca única).
4. Com o JWT em mãos, o app deixa a sessão no **mesmo estado de um login
   normal**: guarda o JWT, busca `/v1/auth/me`, e **cunha a app key**
   (`POST /v1/apps/{slug}/keys`) — sem ela, telas que falam direto com a
   plataforma respondem "sessão sem chave do app". Depois remove o código da URL
   (sem reuso, sem histórico) e vai para a home do app.

## Quem implementa

| App | Tipo | Receptor |
|-----|------|----------|
| portal-suporte | Next | `app/(public)/sso/` (referência) |
| portal-crm | Next | `app/(public)/sso/` |
| portal-horas (time-management) | Vite | `consumeHubHandoff()` em `src/lib/arara.ts`, chamado no `main.jsx` |
| portal-cursos | Vite | `consumeHubHandoff()` em `src/lib/arara.ts`, chamado no `main.tsx` |
| portal-araratech | full-stack próprio | **fora deste contrato** — auth própria (server + prisma), não é client-only |

## Notas de robustez

- Os receptores Vite aceitam também o formato antigo `#/sso?codigo=` (hash),
  além do `?c=` padrão, por robustez.
- Falha na troca (código expirado/inválido) → limpa a URL e cai no login
  normalmente; a pessoa volta ao Hub e clica de novo.
