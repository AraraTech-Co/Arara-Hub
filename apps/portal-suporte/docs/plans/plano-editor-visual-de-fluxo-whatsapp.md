# Design — Editor visual de fluxo de WhatsApp no portal (mini-BotConversa)

Objetivo: dar ao portal a **visão em grafo** dos fluxos de atendimento (igual ao BotConversa) e
a capacidade de **editar os cards e a estrutura** — sem depender do BotConversa. Reaproveita o
motor determinístico já existente (`wa-menu.service.ts`) como interpretador.

Referências de UX: o builder do BotConversa (paleta: Conteúdo, Menu, Ação, Condição, Conexão de
fluxo, Randomizador, Atraso, Integração, Assistente GPT). Lib do canvas: **React Flow**
(`@xyflow/react` v12 — a mesma base de n8n/Typebot/Flowise), versão **fixada** no install.

## Princípio-chave

O que é difícil (executar o fluxo) **já existe**. Este projeto é sobretudo (1) mover o fluxo do
código para o **banco** e (2) construir a **UI de edição**. O interpretador passa a ler o grafo do
banco em vez da constante `wa-menu-flow.ts`.

## Modelo de dados do fluxo (nós + arestas)

Hoje o `wa-menu-flow.ts` embute a aresta na opção (`option.next`). Para um editor visual geral
(React-Flow-nativo e que suporte todos os blocos), separamos:

```
Flow = {
  root: nodeId,
  nodes: [ { id, type, position:{x,y}, data:{...config por tipo} } ],
  edges: [ { id, source, sourceHandle, target } ],
}
```

`sourceHandle` = a "porta" de saída do nó (cada tipo define as suas). Assim uma aresta liga
"opção 2 do menu X" → "nó Y". O interpretador caminha nós/arestas; o `menuNode` da conversa
(que já guarda o nó atual) continua valendo.

### Portas de saída por tipo (mapa dos blocos do BotConversa)

- **content** (Conteúdo): 1 porta `next`. Envia texto/mídia e segue.
- **menu** (Menu): 1 porta por opção (`opt:<id>`) + `no_reply` (sem resposta). Já temos.
- **handoff/action** (Ação): atribui/etiqueta/notifica + escala. 1 porta `next` (ou terminal).
- **condition** (Condição): portas `true`/`false` (ou por regra). Ex.: horário, etiqueta, campo.
- **jump** (Conexão de fluxo): pula para outro nó/fluxo. Terminal do ramo.
- **randomizer** (Randomizador): N portas com pesos (A/B).
- **delay** (Atraso inteligente): 1 porta `next`, após X tempo.
- **integration** (Integração): chama webhook externo. Portas `success`/`fail`.
- **gpt** (Assistente GPT): **o híbrido** — o Claude conduz em linguagem natural; portas
  `resolved`/`handoff`. Reusa o `bot-orchestrator`.

Fase 2 cobre só content/menu/handoff (o que já existe). Os demais entram na Fase 4.

## Armazenamento + versionamento (não quebrar conversa ao vivo)

Tabela nova **`WAFlow`** (V1 = **MÚLTIPLOS fluxos**, decidido 2026-07-22): `id`, `name`,
`enabled Boolean`, `priority Int` (ordem de avaliação), `entry Json` (regra de entrada: horário /
departamento / palavra-chave / padrão), `draft Json`, `published Json`, `version Int`, `updatedAt`.
**Roteamento de entrada**: quando uma conversa começa, o portal escolhe o fluxo cujo `entry` casa
(por prioridade; um fluxo "padrão" como fallback). Um `WAFlowVersion` opcional guarda histórico.

- Editar escreve no **`draft`**. As conversas ao vivo usam **`published`** — editar não as afeta.
- **"Publicar"** copia `draft → published` e incrementa `version`. Opcional: tabela
  `WAFlowVersion` guardando o histórico para rollback.
- O interpretador lê o `published` do fluxo `active` (cache em memória, invalidado ao publicar).

Migração: um seed único cria o `WAFlow` inicial a partir do `wa-menu-flow.ts` atual (a constante
vira a semente; depois o banco é a fonte da verdade).

## Interpretador (mudança no motor)

`wa-menu.service.ts` deixa de importar a constante e passa a:
- carregar o grafo `published` do fluxo ativo (via um `wa-flow.repository` + cache);
- resolver nó por id, achar a aresta pela porta escolhida (`opt:<id>` etc.) → nó destino.
Comportamento atual (menu/content/handoff) preservado; novos tipos adicionados por um `switch`
extensível. Os testes de motor atuais rodam contra o grafo do banco.

## Editor visual (React Flow)

- Rota nova `admin/whatsapp/flow` (admin/master; developer para ler).
- **Canvas** (`@xyflow/react`): pan/zoom, minimapa, nós custom por tipo (estilizados com os tokens
  do portal — cada bloco com sua cor, como na paleta), arestas com portas nomeadas.
- **Paleta** lateral para arrastar novos nós (Fase 3).
- **Editor de card**: painel lateral ao clicar num nó — formulário por tipo (menu: texto +
  opções; content: texto + mídia; etc.).
- **Salvar** serializa nós/arestas → `PATCH` no `draft`. **Publicar** promove. Indicador
  "rascunho não publicado".
- Layout automático inicial (dagre/elk) para posicionar o grafo importado; depois posições são
  salvas por nó.

## Fases (cada uma entrega valor sozinha)

1. **Visão read-only.** Grafo do fluxo ativo em React Flow (import do `wa-menu-flow` → nós/arestas
   + auto-layout). Sem edição. Entrega o "mapa visual". **Rápida.**
2. **Editar conteúdo.** `WAFlow` no banco (draft/published) + interpretador lê do banco + editor de
   card por tipo (menu/content/handoff) + Salvar/Publicar. Resolve 80% da edição do dia a dia.
3. **Editar estrutura.** Adicionar/remover/ligar/arrastar nós; paleta; validação (nó órfão, ciclo,
   opção sem destino). O builder completo.
4. **Novos blocos.** condition, action(rico), gpt(híbrido), delay, randomizer, integration.

## Permissões, segurança, verificação

- Editar/publicar fluxo = admin/master; ver = developer+. Camadas Controller→Service→Repository,
  Zod na fronteira (convenção do projeto). Grafo validado no server antes de publicar (nós/arestas
  íntegros, root existe).
- Verificação: interpretador contra Postgres com grafo no banco (mesmos asserts do motor);
  isolamento draft/published (editar não muda o published lido pelo motor); editor no navegador
  (criar nó, ligar, salvar, publicar, recarregar).
- Dep nova: `@xyflow/react` **fixada** em versão exata; sem `latest` (débito conhecido do projeto).

## Feedback da tela real (2026-07-22) — o que foi ajustado e o que ficou pendente

Ao ver o grafo publicado, apareceram coisas que teste de lógica não pega:
- **Cards sobrepostos** (altura de linha fixa vs menu de 7 opções): CORRIGIDO — layout empilha
  pela altura estimada de cada card.
- **Minimapa** virou bloco branco/preto ilegível: REMOVIDO (grafo pequeno não precisa).
- **Não abria ao clicar / não movia**: era limite deliberado da Fase 1. ANTECIPADO — agora clicar
  abre um painel com o conteúdo completo (os cards cortam o texto) e dá para arrastar.

**Pendências que isso deixou (Fase 2/3):**
- **Persistir a posição** dos nós arrastados (hoje volta ao layout automático ao recarregar) —
  só faz sentido quando o grafo estiver no banco, pois posição é dado do fluxo.
- **Editar de fato** o conteúdo do card pelo painel (hoje é leitura) — é o coração da Fase 2.

## Decisões (2026-07-22)

- **Escopo V1**: **múltiplos fluxos** com regra de entrada (roteamento por prioridade + fallback).
  Afeta o schema (`WAFlow` é coleção + `entry`) e a Fase 2 (lista de fluxos + roteador). A Fase 1
  (visão) renderiza UM fluxo por vez, já com seletor de qual fluxo ver.
- **Ordem**: **Fase 1 primeiro** (visão read-only) → 2 → 3 → 4.
- **React Flow**: `@xyflow/react` fixado em versão exata.
- Pendente: nome/lugar no menu (sugestão: Recursos → "Fluxos de WhatsApp").
