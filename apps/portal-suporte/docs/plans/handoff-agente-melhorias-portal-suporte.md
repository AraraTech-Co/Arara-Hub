# Handoff — melhorias do Portal de Suporte (Fases 1 a 5)

Brief para um agente de código. Imperativo, com caminhos, critérios de aceite e o que não fazer. Escrito em 13/10/2026 sobre o código em produção (`AraraTech-Co/Arara-Hub`, `master`, commit `2b10438`).

Documentos de origem (leia antes de começar; este handoff não repete o texto deles):
- `apps/portal-suporte/docs/plans/checklist-homologacao-fase0-melhorias-portal.md` — checklist da Fase 0 (homologação do que já está no ar).
- `apps/portal-suporte/docs/plans/plano-acao-fases-melhorias-portal-suporte.md` — plano de épicos com a numeração 2.x (melhorias) e 3.x (bugs) usada abaixo.

> Em 13/10/2026 esses dois arquivos **não estavam** em nenhum clone desta máquina. Se não existirem no seu checkout, peça ao Leonardo antes de começar: a numeração 2.x/3.x vem deles.

---

## 1. Contexto e missão

- App: `apps/portal-suporte` (Next.js, export estático) + backend em `packages/api/src/apps/portal-suporte/routes.generated.ts`. Instruções de trabalho do app: `apps/portal-suporte/CLAUDE.md` (local, fora do git). Leia inteiro.
- Missão: implementar **só o que falta** das melhorias 2.x. Não reabrir os bugs 3.1 a 3.14 nem as melhorias já entregues (seção 2).
- Ordem obrigatória: **Fase 1 → 2 → 3 → 4 → 5**. Uma fase por sessão do agente. Cada fase = uma branch + um PR; merge e deploy são do Leonardo.
- Produção é ambiente único, sem staging. Verificação = `GET` + leitura de código. Nunca escrever em produção para testar.

## 2. Já implementado — NÃO refazer

Conferido no código em 13/10/2026. Se encontrar algo desta tabela "faltando", a causa é outra (permissão, dado, cache); investigue antes de reimplementar.

| Item | Evidência no código |
|---|---|
| 2.1 Coluna "Em revisão" removida do Kanban Dev | `app/lib/kanban-dev.ts`; migração `scripts/kanban-dev-migrar-em-revisao.py` |
| 2.5 / 3.6 Grupos de WhatsApp tratados à parte | `app/lib/wa-contato.ts` (`ehGrupo`); aba **Grupos** em `app/_components/inbox/conversation-filters.ts`; abrir chamado a partir da conversa: `POST /whatsapp/:id/ticket` em `routes.generated.ts` |
| 2.9 Sino de notificações in-app | `app/_components/notifications/notification-bell.tsx` |
| 2.10 Anexos / evidências no chamado | `app/_components/tickets/ticket-attachments.tsx` (bloco "Anexos / Evidências") |
| 2.11 Editar e apagar mensagem enviada | `app/_components/inbox/message-list.tsx` (`podeEditar`, `podeApagar`), `message-actions.tsx` |
| 2.12 Numeração `DEV-00000` no Kanban Dev | `app/lib/kanban-dev.ts` (função que normaliza para `DEV-` + 5 dígitos) |
| 3.1 a 3.14 Bugs da rodada de setembro/outubro | fechados em produção; a thread atualiza por consulta periódica isolada por conversa em `app/_hooks/use-conversation-stream.ts` (SSE não existe no runtime) |

Parciais (a Fase 1 e a Fase 4 completam):

| Item | O que já existe | O que falta |
|---|---|---|
| 2.4 Atalhos e edição | `Esc` fecha o seletor de emoji; `Shift+Enter` quebra linha, `Enter` envia (`app/_components/inbox/composer.tsx`) | `Esc` fechar o painel da conversa; atalhos de navegação; formatação WhatsApp |
| 2.6 Notificação | sino in-app (polling) | PWA + Web Push (Fase 4) |
| 2.7 Exportar | PDF do **chamado** em `app/_components/tickets/admin-ticket-details.tsx` (`/api/tickets/:id/pdf`) | transcript da **conversa de WhatsApp** (Fase 1) |

## 3. Convenções do repositório (resumo do que mais pega)

- **Backend é um arquivo só.** Cada rota é uma entrada em `routes.generated.ts` com `handler: compileController("…")`. Rota nova vai **à mão no fim** com o comentário `// 490x modulo METODO path (escrita a mao, data)`, com a guarda `_gsSessao`/`_gsEuSou` colada, e depois `python3 scripts/conferir-guarda.py`. Nunca rode `export:routes`/`codegen:routes`: apagam as rotas escritas à mão.
- Vários handlers nasceram em `apps/portal-suporte/scripts/*.py` e foram colados no `routes.generated.ts`. Alterar o `.py` sem recolar não muda nada. Alterar o `.ts` sem o `.py` deixa o script mentindo. Mude os dois.
- Edição por script no `routes.generated.ts`: conferir que a âncora existe (`indexOf !== -1`) e validar o **arquivo inteiro** com `node --check` depois (um deploy quebrou em 13/10 por isso).
- Cliente HTTP do WhatsApp: `app/lib/api/whatsapp.ts`. Componente não chama `fetch()`.
- Inbox: `app/_components/inbox/inbox-client.tsx` (layout e seleção), `thread-pane.tsx` (cabeçalho + atribuição), `message-list.tsx` (bolhas), `composer.tsx` (envio), `crm-context-panel.tsx` (painel da direita).
- Chamado: `app/_components/tickets/admin-ticket-details.tsx`.
- Sem SSE: tudo é polling (`app/_hooks/use-polling.ts`). Página dinâmica em export estático usa `generateStaticParams` com `[{ id: '_' }]` e `use-rota-dinamica.ts`.
- Permissão nova: nível em `config/access-control.json`; liberável por pessoa = grant em `app/lib/auth/feature-grants.ts`. A trava real fica no servidor.
- Cor só por token de `app/globals.css`. Comentários em português dizendo o **porquê**. Sem refatoração lateral.
- Se o provedor (Avisa) rejeitar um envio, a interface diz a verdade: nada de "enviado" sem resposta 2xx. A Avisa não devolve recibo de entrega.
- Build de verificação: o bloco "Rodar e verificar" do `CLAUDE.md`. Limpo = exit 0 (contagem de páginas muda a cada fase; registre a sua no PR).

## 4. Fases

### Fase 1 — Produtividade na conversa (fecha 2.4 e 2.7)

**Objetivo:** o atendente opera a inbox sem o mouse e exporta a conversa.

Subtarefas:
- **A1 `Esc` fecha o painel da conversa.** Em `inbox-client.tsx`, `Esc` com o foco fora de um campo de texto → `setSelectedId(null)`. Não encerra atendimento, não muda atribuição, preserva o rascunho do composer (guardar por conversa em memória).
- **A2 Atalhos de navegação.** `Ctrl+Alt+N` nova conversa (desabilitado com tooltip até a Fase 2), `Ctrl+Alt+]` / `Ctrl+Alt+[` próxima/anterior na lista filtrada, `Ctrl+Alt+U` marcar não lida (**não existe rota de marcar não lida no portal**: desabilitado com tooltip "ainda não disponível"; criar a rota é decisão do Leonardo), `Ctrl+Alt+M` mover para "minhas" (= **Atender**), `Ctrl+F` com a thread em foco abre a **busca na conversa, que também não existe hoje e é a parte pesada deste item**: campo no cabeçalho da thread, filtro nas mensagens carregadas, contagem "n de m", destaque, Enter/Shift+Enter para próxima/anterior; sem busca no servidor; avisar "buscando só nas mensagens carregadas" quando houver mais. Um só mapa de atalhos em `app/_hooks/use-atalhos-inbox.ts`; nenhum atalho dispara quando o foco está num `input`/`textarea`/`contenteditable`. Lista dos atalhos num tooltip "?" no cabeçalho.
- **A3 Formatação WhatsApp.** Parser puro em `app/lib/wa-formato.ts`: `*negrito*`, `_itálico_`, `~tachado~`, ```` ```monospace``` ````. Usado nas bolhas (`message-list.tsx`) e numa prévia do composer. **Seguro:** nunca gera HTML a partir de texto do cliente; produz uma árvore de nós e renderiza com elementos React. Testes de unidade com os casos de borda (`*` solto, aninhamento, URL com `_`).
- **A4 Exportar transcript da conversa.** No chamado, ao lado de **Exportar PDF**, botão **Exportar conversa** (só aparece quando o chamado veio de uma conversa; o vínculo é conversa→chamado via `ticket_id`, o `GET /tickets/:id` não aponta para a conversa) → diálogo com checkboxes (mensagens do cliente, nossas, eventos do sistema, anexos como lista de nomes) e dois formatos: **TXT** (uma linha por mensagem: `[dd/mm hh:mm] Nome: texto`) e **PDF simples**. Gerado no cliente a partir de `GET /whatsapp/:id/messages` paginado; conversa com mais de 500 mensagens tem de vir inteira (o teto de 500 do `findMany` já foi tratado nessa rota; confira).

Arquivos: `inbox-client.tsx`, `thread-pane.tsx`, `message-list.tsx`, `composer.tsx`, `app/_hooks/use-atalhos-inbox.ts` (novo), `app/lib/wa-formato.ts` (novo), `admin-ticket-details.tsx`.

Critérios de aceite:
- `Esc` fecha o painel e, ao reabrir a mesma conversa, o rascunho está lá.
- Cada atalho faz só o que o nome diz; nenhum dispara com o cursor num campo de texto.
- `*oi*` do cliente aparece em negrito; `<b>oi</b>` aparece literal.
- Exportar conversa com 600 mensagens gera TXT com 600 linhas.

Teste manual: abrir uma conversa, navegar com `]`/`[`, `Esc`, voltar, digitar `*teste*` e conferir a prévia, exportar TXT e PDF de uma conversa antiga.

Riscos: conflito de atalhos com o navegador (por isso `Ctrl+Alt`); regex de formatação com custo exponencial (testar com 10 kB de `*`).

### Fase 2 — Nova conversa iniciada pelo portal (2.8)

**Objetivo:** o atendente abre uma conversa com um número que ainda não escreveu.

- Botão **Nova conversa** no topo da lista (`inbox-client.tsx`) → diálogo que reusa a busca por nome/telefone já existente em `conversation-list.tsx` e o cadastro em `cadastrar-contato-dialog.tsx`.
- Envio pela rota de envio outbound já existente (`whatsapp.ts`). Se já há conversa com o número, abrir a existente em vez de criar outra.
- Erro claro quando o provedor recusa (número inválido, fora da janela de 24 h do WhatsApp): mostrar o texto do servidor, não "erro ao enviar".
- Campo `conta_id` preparado no payload e no modelo, com default = conta única atual. Não expor na UI ainda.

Critérios: criar conversa para número novo → aparece na aba "Minhas" atribuída a quem criou; número existente → abre a conversa existente; recusa do provedor → mensagem com o motivo.

Riscos: duplicar conversa por formato de número (com/sem nono dígito): normalizar com a mesma função usada no inbound (`wa-contato.ts`).

### Fase 3 — Contas de WhatsApp por setor (2.2)

**Objetivo:** mais de um número de WhatsApp no mesmo portal, um por setor.

- Modelo `WaConta` (id, nome, setor, token no secret store, ativa). Migração: a sessão atual vira a conta default **Suporte**; toda conversa existente recebe `conta_id` dela.
- Abas por conta na inbox; filtro por conta na lista; permissão por conta (grant `wa_conta_<id>` ou nível) definida em `feature-grants.ts` e checada no servidor.
- Webhook inbound identifica a conta pelo número de destino; polling da lista e da thread isolado por conta (sem vazar mensagem entre abas).
- Envio outbound usa o token da conta da conversa.

Critérios: mensagem que chega no número B aparece só na aba B; atendente sem grant da conta B não vê a aba nem acessa a conversa por URL (403 no servidor).

Riscos: webhook da Avisa por número; token por conta no secret store; conversas antigas sem `conta_id` (a migração resolve, o código trata `null` como default).

### Fase 4 — PWA e Web Push (fecha 2.6)

**Objetivo:** o atendente recebe notificação com a aba fechada.

- `manifest.webmanifest` + service worker no export estático; **Web Push com VAPID** (sem FCM/OneSignal na v1). Chave privada no secret store da API; pública no front.
- Rota de inscrição (`POST /push/inscrever`, guarda de sessão) e de envio no servidor, chamada pelos mesmos pontos que hoje alimentam o sino.
- Preferências por usuário: quais eventos (nova conversa na fila, mensagem na minha conversa, chamado atribuído). Não duplicar: com a aba focada, só o sino.

Critérios: aba fechada, cliente escreve → notificação no sistema operacional em até 1 min (polling do servidor); aba aberta e focada → só o sino.

Riscos: iOS exige PWA instalada para push; service worker em export estático precisa de escopo `/`; expiração de inscrição (tratar 410 do push service apagando a inscrição).

### Fase 5 — Repositório de arquivos (2.3)

**Objetivo:** arquivos de apoio (scripts, documentos, materiais de homologação) separados dos anexos de chamado.

- Modelo `Arquivo` (nome, pasta, tamanho, tipo, dono, ACL por nível ou grant, criado em) em armazenamento próprio, **não** no blob de anexos de chamado.
- Rotas: listar por pasta, enviar, baixar, apagar. Limite de tamanho e lista de tipos aceitos reusando `app/lib/anexos.ts`. Auditoria: evento por envio/apagamento com quem e quando.
- UI admin em `/admin/arquivos`: lista com pastas, busca por nome, upload por arrastar. Menu lateral no grupo **Recursos**.

Critérios: usuário sem o nível/grant não lista nem baixa (403 no servidor, item ausente no menu); apagar registra auditoria; arquivo de chamado não aparece aqui nem vice-versa.

Riscos: tamanho do blob na plataforma; o mesmo teto de 500 do `findMany` (paginar desde o início).

## 5. O que não fazer

- Não reimplementar nada da seção 2.
- Não tocar em `packages/api` fora de `src/apps/portal-suporte/`, nem em outros `apps/`.
- Não regenerar `routes.generated.ts`.
- Não criar `app/api/` nem `middleware.ts` (código morto no export).
- Não fazer push em `master`, não mergear, não deployar. Não enviar WhatsApp real sem número da equipe e OK do Leonardo.
- Não copiar texto de cliente ou achado de segurança para PR público.
- Não abrir issues no GitHub. Não reescrever os dois planos de origem; só linkar.

## 6. Prompt para colar no agente

```
Leia apps/portal-suporte/CLAUDE.md e apps/portal-suporte/docs/plans/handoff-agente-melhorias-portal-suporte.md inteiros.
Implemente a FASE <N> do handoff, e só ela. Não toque em nada da seção "Já implementado — NÃO refazer".
Antes de escrever código, liste em 10 linhas o que vai mudar, arquivo por arquivo, e me mostre.
Depois: branch feat/fase-<N>-<assunto>, build de verificação limpo (exit 0), testes dos handlers novos em scripts/testes-handlers/, PR em AraraTech-Co/Arara-Hub contra master com os critérios de aceite da fase marcados um a um.
Não mergeie. Não deploye. Não escreva em produção. Me entregue o número do PR e a lista do que eu preciso testar, tela por tela.
```
