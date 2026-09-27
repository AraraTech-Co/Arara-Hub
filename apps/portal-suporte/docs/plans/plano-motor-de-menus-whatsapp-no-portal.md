# Plano — motor de menus de WhatsApp no portal (Opção A, determinístico)

Objetivo: reproduzir no portal a triagem por menus que o BotConversa fazia (menu → escolha →
menu → … → solução ou chama atendente), agora que a Avisa é só transporte. Fonte da árvore:
`docs/mapa-fluxo-botconversa-atendimento-claude-testes.md`. Depois disso rodando, evoluir para o
híbrido (menu + Claude quando o cliente foge do menu).

## Decisões

- **Determinístico** (regras, sem IA). Transporte-agnóstico (mesmo slot do bot).
- **Apresentação**: lista interativa da Avisa (`sendList`), com **fallback**: aceita resposta por
  toque no item OU por número/texto digitado. Se o interativo falhar, o menu ainda anda.
- **Fluxo declarativo** num arquivo TS (`wa-menu-flow.ts`): nós de `menu` (texto + opções),
  `content` (resposta enlatada) e `handoff` (escala pro atendente). Fácil de editar; vira editor
  visual no admin depois.
- **Estado** por conversa: coluna `menu_node` (nó atual) + `menu_updated_at`.
- **Toggle** `waMenuEnabled` (novo em SystemSettings, **off por padrão** — cliente real), separado
  do `waBotEnabled`.
- **Gates** (só conduz o menu quando): menu ligado, sem humano atribuído, conversa não resolvida,
  e ainda não escalada (fase != triagem). Escalou → menu se cala (reusa `escalar_para_humano`).

## Arquitetura

- `app/server/services/wa-menu-flow.ts` — a ÁRVORE (dados). Nós: `{ id, type, ... }`.
- `app/server/services/wa-menu.service.ts` — o MOTOR:
  - `start(conversationId)` → grava nó raiz, envia o menu raiz.
  - `advance(conversationId, reply)` → casa `reply` (id do item OU número OU texto) com as opções do
    nó atual → vai pro próximo nó → envia menu/conteúdo, ou escala no `handoff`. Resposta inválida →
    reapresenta o menu. Best-effort, nunca lança.
- Transporte ganha `sendMenu(conversationId, menu)` — Avisa via `sendList` (+ texto no corpo como
  fallback); BotConversa/others caem para texto numerado via `sendText`.
- `avisa-gateway`: volta o `sendList` (`POST /actions/sendList`).
- `avisa-webhook` normalizer: extrai a resposta de lista/botão (`listResponseMessage.singleSelectReply
  .selectedRowId`, `buttonsResponseMessage.selectedButtonId`) além de texto — o id do item vira o `reply`.
- `inbound-message.service`: se `waMenuEnabled`, chama o motor de menu (antes do bot). 1ª mensagem →
  `start`; demais → `advance`.

## Schema (migration aditiva)

- `WhatsAppConversation.menuNode String? @map("menu_node")` + `menuUpdatedAt DateTime? @map("menu_updated_at")`.
- `SystemSettings.waMenuEnabled Boolean @default(false) @map("wa_menu_enabled")`.

## Fatias

1. **Fundação** (este passo): migration + `wa-menu-flow.ts` (raiz + Suporte + Admin + Vendas, folhas
   escalando) + `wa-menu.service.ts` (motor completo) + `avisa-gateway.sendList` + `transport.sendMenu`.
   Verificar compilação + lógica do motor contra DB (transporte mockado).
2. **Fiar no webhook**: parse da resposta interativa no normalizer + chamada no inbound (gated) +
   toggle no admin. Verificar ponta a ponta.
3. **Árvore completa**: preencher todos os ramos/textos do mapa (BuscaPreço, etiquetas, SGI/SGC,
   instalação, erros de PDV com passos enlatados como nós `content`).
4. **Híbrido** (futuro): Claude assume quando o cliente escreve algo fora das opções.

## Verificação

- tsc no baseline + eslint limpo. Motor testado contra Postgres real (mock do transporte):
  start grava raiz e "envia" menu; advance por id e por número; opção inválida reapresenta; folha
  `handoff` escala (fase triagem + notifica). Gates (menu off / humano atribuído / resolvido) silenciam.
- **Nunca** ligar `waMenuEnabled` em produção sem autorização — cliente real.
