# Plano — corrigir o espelhamento do WhatsApp no portal e avaliar a conexão direta com a Meta

Data: 2026-07-20
Contexto: o portal mostra só a primeira mensagem de cada conversa. Nada do que o
atendente envia aparece, e conversas inteiras somem.

---

## 1. Diagnóstico (com evidência)

Reproduzi contra o webhook rodando, com Postgres real. **Enviei 6 mensagens de 2
clientes; só 3 foram gravadas, e o segundo cliente sumiu inteiro** (a conversa dele
nem chegou a ser criada).

### Causa A — o dedup engole mensagens de todo mundo (crítico)

`app/server/services/inbound-message.service.ts:56-60`:

```ts
const basis = `${e.subscriber_id}:${e.ts ?? ''}:${e.message ?? ''}:${e.media_url ?? ''}`
return `bc-${createHash('sha1').update(basis).digest('hex').slice(0, 24)}`
```

O BotConversa **não envia `subscriber_id`** (não é campo de sistema deles) e o `ts`
chega vazio. Na prática o identificador da mensagem vira uma função **só do texto**.
Como `message_id` é UNIQUE global, o efeito é:

- o mesmo cliente mandando "ok" duas vezes → a segunda é descartada;
- **um cliente diferente mandando "Bom dia" → descartado**, porque colidiu com o
  "Bom dia" de outra pessoa;
- palavras comuns ("ok", "sim", "bom dia", "obrigado") entram **uma única vez na
  história do sistema inteiro**.

Medido: `5519999625834` mandou "Bom dia", "O caixa 3 travou", "ok", "ok" → gravou 3.
`5511988887777` mandou "Bom dia", "ok" → gravou **0**, e a conversa não existe.

Isto explica o sintoma principal: "só aparece a primeira, depois não aparece mais nada".

### Causa B — `ts` como texto derruba a requisição inteira (crítico)

O runbook (`docs/plans/runbook-botconversa-portal.md`, passo 4) manda configurar
`"ts": "{{timestamp unix}}"`. O Bloco de Integração envia isso como **string**, mas o
schema exige número (`webhook.controller.ts:37`, `ts: z.number().nullish()`).

Medido: `{"ts":"1784560000"}` → **HTTP 400 Invalid payload**. `{"ts":""}` → **HTTP 400**.
A mensagem é rejeitada por inteiro. É o "a API não está batendo".

### Causa C — cobertura do fluxo (estrutural)

O portal só recebe o que passar por um Bloco de Integração. No fluxo atual (print) há
**2 blocos de Integração em ~40 blocos**, e o primeiro está logo na entrada. Toda
resposta de menu, e tudo que o cliente escreve depois de entrar no fluxo, não passa por
bloco nenhum — logo não chega ao portal.

Pior: quando o portal pausa o bot para atendimento humano ("Atender"), o fluxo **para de
rodar**. Sem fluxo, não há bloco; sem bloco, não há webhook. Exatamente quando a conversa
fica interessante, o espelhamento morre.

### Causa D — mensagem enviada nunca chega (estrutural, já conhecido)

Não existe caminho para o que o atendente escreve **no painel do BotConversa ou no
celular**. O webhook grava sempre `fromMe: false`
(`inbound-message.service.ts:111`); o campo `origin` só aceita `customer|bot`, e `bot`
nem cria mensagem. A API do BotConversa que usamos não tem leitura de histórico
(`botconversa-gateway.service.ts` só envia, busca contato por telefone, cria contato e
pausa/retoma bot).

**Consequência para as métricas:** os 19 "SLA em risco" do print são falsos. O SLA de
primeira resposta olha `firstResponseAt`, que só é preenchido quando a resposta sai
**pelo portal**. Como a equipe responde por fora, tudo aparece como não respondido.

---

## 2. Plano de ação

### Fase 1 — parar de perder mensagem (1 dia, sem depender de ninguém)

1. **Identificador de mensagem por conversa, não global.** Incluir o telefone e a hora
   de chegada no hash, e trocar o UNIQUE global por único-por-conversa. Mensagem repetida
   de verdade continua deduplicada; "ok" de dois clientes deixa de colidir.
2. **Aceitar `ts` em texto** (e vazio) — coerção no schema, em vez de recusar a
   requisição. Regra geral: o webhook nunca deve responder 400 por causa de um campo
   opcional mal formatado.
3. **Log de rejeição.** Hoje o 400 é mudo: não dá para saber que se está perdendo
   mensagem. Registrar payload rejeitado (sem PII) para o problema aparecer.

Resultado: o portal passa a espelhar **tudo o que o BotConversa encaminhar**.

### Fase 2 — cobertura do fluxo (você no BotConversa, ~1h)

4. Colocar o Bloco de Integração no **início de cada fluxo** que recebe mensagem do
   cliente, não só no de entrada. São ~6 pontos no fluxo do print.
5. Incluir um bloco no caminho de **bot pausado**, se o BotConversa permitir; se não
   permitir, isso vira argumento para a Fase 4.

### Fase 3 — decisão de operação (sua, esta semana)

6. **A equipe passa a responder pelo portal**, não pelo painel do BotConversa nem pelo
   celular. Sem essa decisão, nenhuma correção técnica dá histórico completo — o
   BotConversa não expõe o que o atendente digita lá, e o celular menos ainda.
   É a Fase 3 que faz as métricas (primeira resposta, tempo de atendimento, funil)
   passarem a valer alguma coisa.

### Fase 4 — avaliar a conexão direta com a Meta (spike de 2-3 semanas)

Ver seção 3.

---

## 3. Conexão direta com o WhatsApp (Meta Cloud API) — parecer

### O que muda de verdade

Hoje: `Cliente → WhatsApp → BotConversa → (bloco de integração) → Portal`.
O BotConversa decide o que o portal vê. Direto com a Meta: `Cliente → WhatsApp → Portal`.
O portal recebe **toda** mensagem recebida, o eco das enviadas pela API e os status de
entrega/leitura. O histórico deixa de depender de configuração de fluxo.

### O ponto que ninguém costuma contar

Um número na Cloud API **deixa de funcionar no aplicativo do WhatsApp**. Ou seja: o
"celular original" acaba. Isso é ao mesmo tempo o maior custo e o maior benefício da
mudança — é o que torna o espelhamento completo **estruturalmente garantido**, em vez de
depender de disciplina da equipe. Se a intenção é continuar atendendo pelo celular, não
vale a pena migrar: o problema volta no dia seguinte.

### Custos e requisitos (confirmar valores atuais antes de decidir)

- A API em si não tem mensalidade; cobra-se por conversa/mensagem, e as regras mudaram
  várias vezes nos últimos dois anos. Conversas iniciadas pelo cliente costumam ser bem
  baratas ou gratuitas dentro da janela de 24h; mensagens iniciadas por nós exigem
  **template aprovado** e são pagas.
- Exige conta Meta Business com **verificação de negócio**, aprovação do nome de exibição
  e um número que não esteja em uso no app.
- **Janela de 24h**: fora dela só dá para falar por template aprovado. Isso muda o jeito
  de trabalhar (ex.: "retorno amanhã sobre seu chamado" precisa de template).

### O custo real: o chatbot

Migrar o transporte é a parte fácil (webhook + envio). O caro é **reconstruir o fluxo do
print** — são ~40 blocos com menus, condições e ações. Isso não é um fim de semana: é o
maior item do projeto, e provavelmente maior que tudo que já fizemos na inbox.

### Minha opinião, sem enfeite

**Sim, vale ir direto para a Meta — mas não agora e não por causa dos bugs.**

Três motivos para migrar, em ordem de importância:
1. **Dono do dado.** Hoje o histórico do atendimento da Arara mora num painel de
   terceiro que não expõe leitura. Isso é risco de negócio, não detalhe técnico.
2. **O espelhamento passa a ser garantido por arquitetura**, não por bloco de integração
   configurado à mão em cada fluxo.
3. Custo por mensagem tende a ficar abaixo de mensalidade de plataforma no volume de
   vocês — mas trato isso como bônus, não como argumento principal.

Dois motivos para **não migrar já**:
1. Os bugs das Fases 1 e 2 são de 1 dia e resolvem 80% da dor imediata. Migrar para
   fugir de bug é trocar de problema.
2. O chatbot é o trabalho pesado. Entrar nisso sem antes decidir a Fase 3 (a equipe
   atende no portal) é construir a casa antes de saber se alguém vai morar nela.

**Caminho que eu defendo:** Fase 1 e 2 agora. Fase 3 decidida nesta semana. Depois um
spike de 2-3 semanas com **número de teste** na Cloud API — só recebimento e envio, sem
chatbot, rodando em paralelo com o BotConversa. Com esse spike na mão dá para estimar a
migração do fluxo com números reais em vez de chute. Se o spike mostrar que o
recebimento funciona liso, aí sim planejar a troca do número principal.

O que eu **não** recomendo em nenhum cenário: biblioteca não-oficial (Baileys, Evolution
API e afins) plugada no número da empresa. É violação dos termos e o risco é o número
principal da Arara ser banido — justamente o ativo que se quer proteger.

---

## Verificação da Fase 1 (como provar que funcionou)

Repetir o teste desta investigação: 6 mensagens, 2 clientes, com repetições ("ok" duas
vezes, "Bom dia" dos dois). Esperado: **6 gravadas, 2 conversas**. Hoje dá 3 e 1.
