# Runbook — Integrar o BotConversa ao Portal (atendimento centralizado)

Guia para ligar o WhatsApp do portal ao **BotConversa** (Opção A: o portal é a inbox;
o BotConversa é o transporte). O código do portal já está pronto; aqui vão os passos
do lado do BotConversa e da configuração de ambiente. **A configuração dos passos 3-4
é feita no painel do BotConversa por você/admin — o assistente guia.**

> ## ⛔ PRÉ-REQUISITO — plano **Pro** do BotConversa
> O encaminhamento de cada mensagem para o portal usa o **"Bloco de Integração"**
> (dentro de *Fluxos de conversa*) e/ou a aba **Webhooks** de *Automação* — **ambos são
> recursos Pro (pagos)** do BotConversa. **Sem o Pro, a Opção A não funciona.**
>
> **Status atual (2026-07-03):** todo o código do portal, o wiring de deploy e as env
> vars estão **prontos e commitados no `development`**. A integração está **bloqueada
> apenas** por: (1) contratar o **Pro** do BotConversa e (2) obter a **API key**. Feito
> isso, seguir os passos abaixo. Alternativa sem Pro = **Opção B** (atendentes usam o
> Inbox nativo do BotConversa; portal só sincroniza para CRM/tickets) — exige replanejar.

> **Ordem obrigatória:** primeiro o endpoint do portal precisa estar no ar (deploy ou
> túnel) para o Bloco de Integração ter para onde apontar.

---

## 1. Variáveis de ambiente do portal

No `.env` (dev) ou secrets do deploy (prod):
```
BOTCONVERSA_API_KEY=<chave da API do BotConversa>
BOTCONVERSA_API_URL=https://backend.botconversa.com.br/api/v1/webhook
BOTCONVERSA_WEBHOOK_SECRET=<gere um segredo forte, ex.: openssl rand -hex 24>
# opcionais (handoff — só se souber os valores de status do BotConversa):
BOTCONVERSA_STATUS_PAUSE=
BOTCONVERSA_STATUS_RESUME=
```
- **API key:** painel BotConversa → **Configurações → Integrações → API** → copiar.
- Em **prod**, adicionar `BOTCONVERSA_API_KEY` e `BOTCONVERSA_WEBHOOK_SECRET` como
  **GitHub secrets** e exportá-los no `deploy.yml` (o `remote/core.yml` já repassa as vars
  para o container).

## 2. URL do webhook do portal

- **Prod:** `https://suporte.arara-tech.com/api/webhooks/whatsapp`
- **Dev:** exponha o portal local com um túnel (ex.: `cloudflared`/`ngrok`) e use a URL do túnel + `/api/webhooks/whatsapp`.

Essa rota já existe, é pública (em `publicPaths`) e valida o header `x-webhook-secret`.

## 3. Fluxo catch-all no BotConversa

No painel do BotConversa → **Fluxos**, garanta que **toda mensagem recebida** passe por um
fluxo que contenha o Bloco de Integração do passo 4. O ideal é o **fluxo padrão/fallback**
(o que roda quando a mensagem não casa com outro gatilho).

## 4. Bloco de Integração (encaminha cada mensagem ao portal)

Dentro desse fluxo, adicione um **Bloco de Integração**:
- **Método:** `POST`
- **URL:** a do passo 2.
- **Headers:**
  - `x-webhook-secret: <BOTCONVERSA_WEBHOOK_SECRET>`
  - `Content-Type: application/json`
- **Body (JSON)** — mapeie as variáveis do BotConversa para este formato (o portal espera exatamente estas chaves):
  ```json
  {
    "subscriber_id": "{{id do assinante}}",
    "phone": "{{telefone}}",
    "name": "{{nome completo}}",
    "message": "{{última mensagem do usuário}}",
    "media_url": "{{url da mídia, se houver}}",
    "media_type": "{{image|audio|document, se houver}}",
    "ts": "{{timestamp unix, se houver}}"
  }
  ```
  (Use os nomes reais das variáveis do BotConversa no lugar dos `{{...}}`. `subscriber_id`
  e `phone` são obrigatórios; o resto é opcional.)
- **Timeout:** 10s (limite do bloco). O portal responde rápido (só persiste + notifica a inbox por SSE).

## 5. Cobertura — o principal ponto de atenção

O portal só recebe o que o Bloco de Integração encaminhar. Se o cliente estiver preso em
outro fluxo (ex.: um menu), a mensagem pode não chegar ao portal. Garanta que o bloco
cobre o caminho de entrada / o fluxo padrão. (Se preferir, dá para colocar o bloco no
início de cada fluxo relevante.)

## 6. Política de bot (decisão)

- **Manter o bot** (menu/triagem) do BotConversa: o portal **pausa** o bot ao "Atender"
  (via `change_conversation_status`) — para isso, preencha `BOTCONVERSA_STATUS_PAUSE`/
  `_RESUME` com os valores de status corretos do seu BotConversa.
- **Sem bot:** o portal atende tudo; deixe as vars de status vazias (o pause vira no-op).

---

## Verificação ponta a ponta

1. Setar as env vars (passo 1) e deixar o portal no ar (passo 2).
2. Configurar o Bloco de Integração (passos 3-4).
3. Mandar uma mensagem de teste do WhatsApp para o número do BotConversa → conferir que:
   - aparece uma conversa na **inbox** do portal (ao vivo, via SSE);
   - o CRM foi resolvido (empresa/contato, se o telefone casar);
   - "Atender" atribui e (se configurado) pausa o bot;
   - responder pelo composer chega no WhatsApp **com a assinatura** do atendente.
