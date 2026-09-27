# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Cliente (lojista).** Funcionário de loja de varejo — operador de caixa, gerente,
fiscal de loja — que usa o SGC/PDV no dia a dia e não é técnico. Abre chamado quando
algo parou: o PDV travou no meio da venda, a NFC-e não transmite, o servidor da loja
caiu, a impressora não imprime o cupom. Frequentemente está **em pé, no balcão, com
fila**, usando o celular de outra pessoa. Escreve "chamado", não "ticket".

**Equipe Arara.** 10 pessoas hoje: 7 `support`, 1 `developer`, 2 `admin`. Trabalham
no Kanban, não na home nem no login — passam por essas telas uma vez por sessão.

A home pública e o login são vistos quase exclusivamente pelo primeiro grupo, e quase
sempre com um problema em andamento. Ninguém navega um portal de suporte por curiosidade.

## Product Purpose

Concentrar o atendimento da Arara Tech num lugar só: o cliente abre e acompanha
chamados, a equipe tria e resolve no Kanban. Existe para substituir o atendimento por
celular pessoal e WhatsApp solto, onde o pedido some e não há prazo nem histórico.

Sucesso = o cliente com o sistema parado consegue registrar e ser atendido **sem
telefonar para o celular de alguém**.

## Positioning

Suporte de quem fez o produto. A Arara desenvolve o SGC; o mesmo time que atende o
chamado altera o sistema. Isso permite ao chamado atravessar de "suporte" para
"desenvolvimento" sem virar outro processo — algo que uma central terceirizada de
helpdesk não consegue oferecer.

## Operating Context

- **Onde:** balcão de loja, muitas vezes no celular, com o problema acontecendo agora.
- **Fluxo do chamado:** 7 colunas — Backlog → Triagem → Em Atendimento → Pendência →
  Teste e Homologação → Resolvido → Fechado, com pendência subdividida em suporte, dev
  e cliente.
- **Vocabulário real da operação:** chamado, PDV, NFC-e/NF-e, SAT, SEFAZ, TEF, caixa,
  sincronização, servidor da loja, contingência.
- **Entradas de chamado:** portal, WhatsApp e registro pela própria equipe.
- **Domínio:** suporte.arara-tech.com. Hospedagem estática servida pela plataforma
  Arara; front-end sem servidor próprio.

## Capabilities and Constraints

- Next.js com `output: 'export'` — **estático puro, sem servidor**. Sem SSR, sem rota
  de API própria: tudo vai à Arara API Platform pelo navegador. Rota dinâmica não
  sobrevive ao export; o id viaja na query.
- `trailingSlash: true`.
- Tokens semânticos já existem em `app/globals.css`: tríades `sem-*` (info, success,
  warning, error), e famílias `status-*`, `priority-*`, `severity-*` que espelham o
  fluxo real do suporte. `--primary` está definido, com variante dark, e hoje não é
  usado nas telas públicas.
- Autenticação com senha **ou** link mágico por e-mail, validade de 15 minutos.
- Papéis canônicos: `user` (10) · `support` (20) · `developer` (30) · `admin` (40).
- **Não decidido:** quem pode criar conta de cliente. Hoje o login oferece autocadastro
  sem exigir contrato ou CNPJ; não está confirmado se isso é intencional. Não inventar
  regra de acesso enquanto não decidido.

## Brand Commitments

- O suporte é da **Arara Tech**, e as telas públicas devem dizer isso — hoje o nome não
  aparece em lugar nenhum, o que foi descuido e não decisão de marca branca.
- O sistema atendido é o **SGC**, e pode ser nomeado.
- Idioma: português do Brasil. Usar "chamado", não "ticket".

## Evidence on Hand

- **Não há métricas publicáveis.** Os números hoje exibidos (`< 4h`, `98%`, `99%`,
  `24/5`, `12 agentes ativos`) são literais escritos no código, contradizem-se entre a
  home e o login, e foram **removidos por decisão do cliente**. Não fabricar
  substitutos.
- Não há telefone nem WhatsApp público a divulgar: a urgência é atendida por **chamado
  marcado como urgente**, não por canal direto.
- Sem depoimento, logo de cliente, caso ou prêmio disponível. Não inventar.
- Base real, se algum dia for publicável: 454 chamados, 20 empresas cadastradas.
  Registro de SLA existe para 4 deles — insuficiente para qualquer afirmação de prazo.

## Product Principles

1. **Quem chega está com problema, não avaliando compra.** A porta de entrada é triagem,
   não argumento de venda.
2. **Urgência tem caminho próprio.** Sistema parado não pode disputar atenção com pedido
   de relatório; a severidade já existe no modelo de dados e deve aparecer na entrada.
3. **Nenhum número inventado.** Sem dado real por trás, não se publica.
4. **Uma palavra por coisa.** "Chamado" em todo lugar; nunca "chamado" e "ticket" para a
   mesma ação.
5. **O celular no balcão é o caso principal**, não a adaptação do desktop.

## Accessibility & Inclusion

- WCAG AA (4,5:1 em texto normal, 3:1 em texto grande) é o piso: a auditoria mediu 2,05:1
  no painel do login e 2,60:1 nos números da home. Não repetir.
- Alvo de toque mínimo 44×44 px: hoje há alvos de 16 px e de 32 px.
- Tema claro e escuro são ambos de produção — o Android de loja costuma vir no claro.
  Nenhum painel pode fixar fundo de um tema e texto do outro.
- Erro e sucesso precisam ser anunciados por leitor de tela (`role="alert"` /
  `aria-live`), hoje inexistentes.
