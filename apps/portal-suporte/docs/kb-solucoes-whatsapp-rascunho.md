# Rascunho — soluções conhecidas para a KB do bot (A2)

⚠️ **RASCUNHO — não publicar sem revisão humana.** São textos que o bot mandaria direto ao
cliente. Extraídos do fluxo `[Arara Tech] - Atendimento Claude TESTES` (ver
`mapa-fluxo-botconversa-atendimento-claude-testes.md`). Quando revisados, viram artigos
`KbArticle` publicados (com embedding), e a ferramenta `buscar_solucao_conhecida` do bot passa a
servi-los via `searchKnowledge`.

## Capturadas do fluxo (revisar texto e categoria)

### Erro ao atualizar o PDV
Nesse caso basta fazer a atualização completa do sistema: feche o sistema e abra novamente; na
tela inicial faça uma atualização completa do PDV.
(No fluxo acompanha a imagem `erro_de_atualizacao.png` — decidir se a KB terá imagem.)

### Servidor BuscaPreço — erro nos terminais
Reinicie os terminais para sincronizar com o servidor: desligue o terminal, desconecte o cabo de
rede e o cabo de energia. Após 20 segundos, ligue o terminal novamente.

### Instalação/configuração de PDV (informativo — não é "fix")
O serviço de Instalação e Configuração de PDV custa R$ 90,60 por máquina. Estamos à disposição
para agendamentos.
(É venda/serviço, não autoatendimento — melhor tratar como escalar para Vendas do que como
solução self-service.)

## Solução ainda não capturada (o texto do bloco Conteúdo precisa ser lido no fluxo, ou escrito pelo time)

Do menu de Suporte/PDV, faltam os passos destes erros:
- Erro ao emitir cupons fiscais (NFC-e)
- Erro ao retransmitir notas fiscais
- Erro ao fazer login do usuário
- Erro de abertura/fechamento de caixa
- Erro de tributação
- Erro de NCM
- Sistema de etiquetas (nenhuma impressora imprime / etiquetas invertidas)
- SGI / SGC (opções fiscais / financeiros / fora do ar)

## Política que NÃO vira artigo (já está no system prompt do bot — A1)

- Pedir print/foto da tela de erro.
- Administrativo/Financeiro e Vendas: sempre escalar para uma pessoa.
- Fora do horário: avisar que um atendente retorna no próximo horário comercial (A4).
