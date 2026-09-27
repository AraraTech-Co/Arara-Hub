# Mapa do fluxo BotConversa — "[Arara Tech] - Atendimento Claude TESTES"

Cópia de trabalho autorizada (constructor/9115398). Desligada do número — não recebe
cliente real. Mapeada bloco a bloco em 2026-07-20 via Chrome, para servir de fonte da
verdade tanto para (a) instrumentar a integração com o portal quanto (b) portar a árvore
para o motor de bot no portal (Claude) quando virarmos para a Meta.

## Tipos de bloco usados

- **Bloco Inicial** (verde) — entrada do fluxo.
- **Integração** (rosa) — `POST https://suporte.arara-tech.com/api/...` (o webhook que
  espelha a conversa para o portal). Modo "Em resposta com sucesso / Continuar sem esperar
  resposta".
- **Condição** (branca) — desvio lógico ("Lógica Ou").
- **Menu** (azul) — pergunta + botões (Respostas).
- **Conteúdo** (laranja) — mensagem(ns) enviada(s) ao cliente, às vezes com imagem.
- **Ação** (amarela) — atribuir/abrir atendimento, notificar membros da equipe, adicionar
  etiqueta.

## Árvore do fluxo

### Entrada
1. **Bloco Inicial**
2. → **Integração** — webhook para o portal (`POST suporte.arara-tech.com/api/...`).
3. → **Condição** — "Atendimento está atribuído para um membro" (senão: nenhuma condição).
4. → **Menu principal**: *"Olá, tudo bom com você? Como posso ajudar?"* — botões:
   - Resposta 1: **Preciso de Suporte da AraraTech**
   - Resposta 2: **Quero falar com AraraTech Administrativo, Financeiro**
   - Resposta 3: **Quero falar com a área de Vendas da AraraTech**

### Ramo Suporte
- **Menu**: *"Certo, para agilizar o atendimento, selecione qual o erro apresentado no PDV:"*
  - Erro ao emitir cupons fiscais (NFC-e)
  - Erro ao retransmitir notas fiscais
  - Erro ao atualizar o PDV
  - Erro ao fazer login do usuário
  - Erro de fechamento/abertura de caixa
  - Erro de tributação
  - Erro de NCM
- Sub-ramos observados:
  - **Erro ao atualizar o PDV** → **Conteúdo** (com imagem `erro_de_atualizacao.png`):
    *"nesse caso basta fazer a atualização completa do sistema… Feche o sistema e abra
    novamente…"*.
  - **Servidor BuscaPreço** → **Menu**: *"Como posso te ajudar com o servidor BuscaPreço?"*
    (Está com erro de atualização / Está com erro nos terminais) → **Conteúdo**: *"reinicie
    os terminais para sincronizar com o servidor… desligue o terminal, desconecte o cabo de
    rede e o cabo de energia. Após 20 segundos ligue o terminal novamente."* → **Menu**:
    *"Tem algo mais que posso ajudar?"* (Tudo certo por hora, Obrigado / Ainda não resolveu,
    estou com o mesmo erro / Tenho outro erro).
  - **Sistema de etiquetas** → **Menu**: *"Referente ao sistema de etiquetas, como posso te
    ajudar?"* (Nenhuma impressora imprime / Imprimindo as etiquetas invertidas…).
  - **SGI / SGC** → **Menu**: *"…SGI / SGC, como posso ajudar?"* (opções fiscais / financeiros
    / fora do ar).
- Folhas do ramo Suporte terminam em **Conteúdo** do tipo: *"Certo, pedimos desculpas pela
  inatividade… acionaremos a lista para verificar e retornar aqui o mais rápido possível"* +
  *"Poderia enviar um print/foto da tela mostrando o endereço offline?"*.

### Ramo Instalação / Vendas de PDV
- **Menu**: *"O serviço de Instalação e Configuração de PDV possui o valor de R$ 90,60 por
  máquina. Estamos à disposição para agendamentos."*
  - Autorizo e desejo agendar a instalação
  - Preciso de muitos PDVs, prefiro falar com o time de vendas
- → **Ação**: notificar **Todos os membros** por Email & WhatsApp — *"Foi Solicitado a
  Instalação de um PDV pelo Cliente (nome) (telefone)…"* + etiqueta **InstalacaoSolicitada**.

### Ramo Administrativo / Financeiro
- **Ação**: etiqueta **Administrativo**; "Atribuir e abrir atendimento: selecione, por favor";
  notificar **Cris** por WhatsApp — *"Olá, O Cliente (primeiro-nome) (telefone) Pediu
  atendimento para Administrativo Financeiro ou Vendas"*.
- → **Conteúdo**: *"Legal, já notifiquei o time humano aqui, você terá uma resposta em breve.
  Obrigado."*
- Variante fora de horário: **Ação** notificando **Leonardo C. Lolato** + etiqueta
  **AtendForaDoHorario**.

### Padrão de handoff (repete em vários pontos)
1. **Condição** — "Horário de Atendimento / Fechado".
2. **Ação** — Atribuir e abrir atendimento (Suporte/Administrativo) + Notificar membros da
   equipe por WhatsApp (*"…o usuário (nome-completo) (telefone) passou pelo fluxo mas ainda
   precisa de Atendimento, você pode ajudar?"*) + Adicionar etiqueta (ex.: `AtendForaDoHorario`).
3. **Conteúdo** — *"Vou direcionar para um dos nossos analistas te ajudar…"* / *"Legal, já
   notifiquei o time…"*.
4. **Integração** — webhook para o portal (2ª ocorrência confirmada, no fim do ramo).
- Fora de horário sem resposta: **Conteúdo** *"Tempo de atendimento sem resposta atingido…"*
  → **Ação** "Cliente não respondeu".

## Cobertura da Integração (o achado que importa)

Só há bloco **Integração** (webhook → portal) em **dois pontos**: na **entrada** do fluxo e no
**fim de ramo** (após o handoff). O webhook dispara quando o bloco é atingido, carregando o
`last_message` daquele instante.

Consequências — batem exatamente com o sintoma relatado ("só a primeira recebida, nenhuma
enviada, sem histórico"):

1. **Respostas do cliente no meio do menu não re-disparam o webhook.** Cada seleção/mensagem
   entre a entrada e o handoff não tem Integração → o portal não recebe.
2. **Mensagens do atendente digitadas no painel do BotConversa nunca passam pelo fluxo** → o
   portal **jamais** vê o outbound. Isto é um teto da arquitetura BotConversa, não um bloco
   faltando: não existe onde encaixar um Integração que capture o que o atendente digita fora
   do fluxo.
3. **Sem histórico**: a API do BotConversa não expõe leitura de mensagens; o espelho começa do
   zero a cada disparo.

## Leitura / recomendação

- Instrumentar **inbound** é possível (um Integração após cada ponto em que o cliente responde),
  mas trabalhoso e frágil, e **não resolve o outbound** — que é metade do problema.
- Como já decidimos que o **cérebro vai para o portal (Claude) e o transporte vira trocável**,
  reconstruir 40+ blocos de Integração no BotConversa é esforço com data de validade: na virada
  para a **Meta Cloud API**, o portal passa a ser o cliente e vê **toda** mensagem (entrada e
  saída) nativamente, e esta árvore vira lógica do bot no portal.
- Por isso este mapa é o entregável principal: é a especificação do que o bot do portal precisa
  cobrir (menus, ramos, textos, etiquetas, regras de handoff/horário).

## Investigação da área de Automações (2026-07-20)

Explorada em modo leitura (nada foi criado/alterado). Conta **AraraTech ID 137259**.

- **Palavras Chave** — existe **um** grupo: `[Arara Tech] - Atendimento Normal` → ação
  "Iniciar Fluxo: Atendimento AraraTech", gatilho **"Contém" [A E I O U a e i o u]** (todas as
  vogais). Na prática é um **catch-all**: quase toda mensagem contém vogal, então isso inicia o
  fluxo — e o Integração de entrada dispara — em qualquer mensagem. 437 execuções, ligado. **É
  daqui que vem o espelho da primeira mensagem.**
- **Webhooks** (aba da Automação) — são webhooks de **entrada** (portal → BotConversa): 4
  cadastrados (Portal-suporte/Modo Teste, GC/Modo Teste, nome-cliente/Ativo 62 req, Cardoso
  calendar/Modo Teste). Não servem para espelhar saída.
- **Sequências** — não inspecionado a fundo; irrelevante para espelho de mensagem.

## Raiz provável do "não chega quando mandam" (inferência, não provado)

O catch-all **já existe** — logo o problema **não** é falta de gatilho. A causa mais provável:
quando o fluxo faz o handoff ("Atribuir e abrir atendimento" para uma pessoa), o BotConversa
**pausa o bot** naquele contato (o mesmo `pauseBot` que o gateway do portal usa para não falar
por cima do atendente). Com o bot pausado, **nem o catch-all de palavra-chave nem blocos de
Integração disparam** → durante o atendimento humano — exatamente quando ocorre a conversa real —
**nada é espelhado, nem entrada nem saída**. Bate com o sintoma relatado.

Confirmar de forma limpa exigiria enviar uma mensagem no número real com um atendimento atribuído
e observar se o webhook bate — não feito por ser o número de produção.

## Decisão (2026-07-20)

Instrumentar o BotConversa foi **descartado**: o teto não é um bloco faltando, é o bot pausado na
fase humana. Seguimos para **portar esta árvore para o motor de bot no portal (Claude) + Meta
Cloud API**, onde o portal é o cliente e vê toda mensagem (entrada e saída), com o bot pausado ou
não. Este mapa é a especificação do porte. Plano de execução:
`docs/plans/plano-porte-arvore-atendimento-para-bot-do-portal.md`.
