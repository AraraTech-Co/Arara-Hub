---
name: Portal de Suporte — Arara Tech
description: Mesa de trabalho para quem atende chamados o dia inteiro; a marca aparece em detalhe, nunca em bloco.
colors:
  marca-azul: "oklch(0.687 0.138 231.4)"
  marca-azul-texto: "oklch(0.43 0.138 231.4)"
  marca-verde: "oklch(0.723 0.160 123)"
  fundo-claro: "oklch(0.992 0.003 70)"
  fundo-escuro: "oklch(0.185 0.008 70)"
  superficie-clara: "oklch(1 0 0)"
  superficie-escura: "oklch(0.225 0.009 70)"
  lateral: "oklch(0.155 0.012 70)"
  contorno-claro: "oklch(0.912 0.006 70)"
  contorno-escuro: "oklch(0.305 0.010 70)"
  texto-secundario-claro: "oklch(0.505 0.008 70)"
  texto-secundario-escuro: "oklch(0.635 0.011 70)"
typography:
  title:
    fontFamily: "Geist, Geist Fallback, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Geist, Geist Fallback, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, Geist Fallback, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
  data:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    fontFeature: "tabular-nums"
rounded:
  sm: "0.625rem"
  md: "0.75rem"
  lg: "0.875rem"
  xl: "1.125rem"
  pill: "9999px"
spacing:
  interno-item: "0.75rem"
  interno-painel: "1.5rem"
  entre-irmaos: "1rem"
  entre-secoes: "2rem"
components:
  painel:
    backgroundColor: "{colors.superficie-clara}"
    rounded: "{rounded.lg}"
    padding: "{spacing.interno-painel}"
  cartao-kanban:
    backgroundColor: "{colors.superficie-clara}"
    rounded: "{rounded.sm}"
    padding: "{spacing.interno-item}"
  botao-primario:
    backgroundColor: "{colors.marca-azul-texto}"
    textColor: "{colors.superficie-clara}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  distintivo:
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
    typography: "{typography.label}"
---

# Sistema visual — Portal de Suporte

## Overview

**O plantão calmo.** A tela é o posto de trabalho de alguém que passa oito
horas triando chamado. Não é uma vitrine: nada aqui precisa impressionar, tudo
precisa ser lido rápido e não cansar até o fim do turno. A metáfora orienta
todas as decisões abaixo — quando houver dúvida entre *bonito* e *sustentável
por oito horas*, ganha o segundo.

Isso tem consequência direta: **contraste alto para o conteúdo, contraste baixo
para a moldura.** O que muda (status, prazo estourado, carga do agente) tem
direito à cor. O que só delimita (painel, coluna, linha de lista) recua para
superfície e profundidade. A regra existe porque o oposto foi testado e
rejeitado: a interface anterior tinha fio em volta de cada bloco e tinta
saturada em faixas grandes — o resultado foi descrito como *"parece 16 bits,
tudo muito quadradão, não é agradável aos olhos"*.

**Anti-referência confirmada:** moldura em tudo; cor de distintivo esticada por
área grande; superfície de painel igual à cor da página.

**A marca aparece em detalhe.** Azul e verde vieram medidos do logotipo, mas
vivem em acento, ação e estado — nunca como bloco de fundo.

## Colors

**Origem.** Duas matizes, extraídas do logotipo em 10/09/2026: azul `#06A8E0`
(matiz **231.4**) e verde `#93B52E` (matiz **123**). Os neutros são quentes,
matiz **70** — cinza puro ao lado do azul da marca lê como sujeira.

**A marca precisa de rampa por tema, e a medição diz por quê.** O azul cheio
carrega texto branco a apenas 2,73:1 e, sobre fundo claro, lê a 2,67:1 — os
dois reprovam. Por isso:

| | Claro | Escuro |
|---|---|---|
| `--primary` | `oklch(0.43 0.138 231.4)` — carrega branco a 7,45:1 | `oklch(0.687 0.138 231.4)` — cheio, com texto quase-preto a 6,84:1 |
| `--primary-foreground` | branco | `oklch(0.17 0.010 70)` **quase-preto, não branco** |

Mesmo matiz, mesma croma, luminância trocada. **Nunca use o azul cheio como
fundo de texto branco.**

**Famílias semânticas** — cada uma com fundo, `-fg` (texto) e `-bd` (borda),
definidas nos dois temas:

- `--sem-{success,warning,error,info}` — estado geral. `success` usa o verde da
  marca (matiz 123): "resolvido" é onde a marca aparece de graça.
- `--status-{...}` — os 16 status de chamado.
- `--priority-{...}` / `--severity-{...}` — com dois extras: `-line` (trilho do
  cartão) e `-dot` (ponto indicador). Prioridade tem 5 níveis desde 14/09/2026
  (Muito baixa → Muito alta); a chave `urgent` é exibida como "Muito alta".
  "Muito baixa" (`very_low`) não tem cor de propósito: só borda tracejada e o
  `-dot` mais apagado — cor chamaria atenção para o que menos merece.

**Rampas do Tailwind sobrescritas.** `indigo`, `violet` e `purple` apontam para
a mesma rampa azul da marca; `green` aponta para `emerald`. Isso reconcilia
código legado sem tocar em componente. O degrau 600 carrega branco (6,05:1) e o
400 é a cor viva sobre o carvão escuro (7,30:1).

**Sub-tema.** `devops-theme` (`app/styles/devops.css`) é **escuro sempre, por
decisão**, com tokens `--devops-*` próprios. Telas de DevOps usam esses, não os
genéricos.

## Typography

**Geist** para tudo, **Geist Mono** para dado. Uma família só; a hierarquia vem
de tamanho e peso, não de troca de fonte.

- Título de painel: 1.125rem / 600
- Corpo e conteúdo de tabela: 0.875rem / 400
- Rótulo e distintivo: 0.6875rem / 600, tudo em caixa normal
- Metadado e carimbo de tempo: 0.6875rem, `text-foreground/65`

**`tabular-nums` é obrigatório** em qualquer número que apareça em coluna,
contador ou carimbo de tempo. Sem ele os dígitos dançam a cada atualização e o
olho reancora à toa — caro numa tela que atualiza sozinha.

Texto secundário sobre superfície colorida tinge a partir daquela matiz
(`text-sem-error-fg`), nunca cinza.

## Layout

- **Largura máxima `1800px`**, com respiro lateral que cresce: `px-4 md:px-6
  2xl:px-12`. O teto anterior era `max-w-7xl` (1280px fixos) e deixava ~360px
  vazios de cada lado numa tela de 2000px.
- **Lateral**: 16rem aberta, 4rem recolhida, transição só em `width`.
- **Coluna do Kanban**: 260px em `sm+`; no celular 90vw com `snap`, uma coluna
  focada por vez e um naco da próxima aparecendo.
- **Medida de leitura**: 68ch nas bolhas de conversa.
- Agrupar por proximidade antes de recorrer a container. Ritmo vem do contraste
  entre intervalo apertado e generoso — não de repetir o mesmo valor.

## Elevation & Depth

**Esta é a regra que mais define o portal: separação é profundidade, não
borda.**

```
--shadow-baixa: 0 1px 2px rgb(0 0 0 / 0.18)
--shadow-media: 0 1px 2px rgb(0 0 0 / 0.22), 0 8px 24px -12px rgb(0 0 0 / 0.35)
--shadow-alta:  0 2px 4px rgb(0 0 0 / 0.24), 0 16px 40px -16px rgb(0 0 0 / 0.45)
```

- **Painel**: `bg-card` + `shadow-[var(--shadow-media)]`, **sem borda**.
- **Item dentro de lista** (cartão de Kanban): `shadow-[var(--shadow-baixa)]`,
  subindo para `media` no hover.
- **Sobreposição** (diálogo, menu): `alta`.

No tema claro a sombra faz o trabalho; no escuro, metade dele é o degrau de
luminância entre `--background` (0.185) e `--card` (0.225). Por isso **painel
usa `bg-card`, nunca `bg-background`** — igualar os dois deixa o bloco
indistinguível e obriga a borda de volta.

**Borda de 1px sobrevive em item pequeno** — distintivo, pílula, campo. Num
elemento de 20px o fio é a própria forma, não moldura.

## Shapes

`--radius: 0.75rem`, com `sm` = −2px, `lg` = +2px, `xl` = +6px. Distintivo e
pílula são `rounded-full`.

**Uma exceção informativa ao raio uniforme:** o cartão do Kanban tem
`border-l-4` na cor da prioridade (`--priority-{n}-line`). É a leitura de
triagem mais rápida que existe num quadro denso, e por isso vale a quebra —
mas é **a única** borda colorida acima de 1px permitida no portal.

Faixa e trilha grandes recebem a cor como **filete**, não preenchimento:
`boxShadow: inset 0 3px 0 0 var(--status-X-fg)` sobre superfície neutra.

## Components

| Componente | Tratamento |
|---|---|
| `Card` (`app/_components/ui/card.tsx`) | Base sem borda, `shadow-media`. 65 arquivos herdam — mudar aqui muda o portal. |
| Cartão do Kanban | `bg-card`, `border-l-4` de prioridade, `shadow-baixa` → `media` no hover; arrastando ganha `alta` + rotação de 1°. |
| Coluna do Kanban | Trilha única elevada: cabeçalho `bg-card` com `border-t-4` da etapa, corpo `bg-muted/40`, sombra no invólucro. |
| Campo e `Select` | Já se pintam por token (`border-input`, `bg-background`, `bg-popover`). **Não sobrepor cor.** |
| Distintivo | `rounded-full`, fundo + `-fg` + `-bd` da mesma família, `text-[11px] font-semibold`. |
| Lateral | `bg-sidebar` (carvão quente), separadores `border-white/[0.08]`, marca em SVG a 28–32px. |
| Bolha de conversa | Minha: `border-primary/25 bg-primary/10`. Do outro: `border-border bg-muted`. Mensagens seguidas do mesmo autor se agrupam. |

Fontes canônicas de rótulo e cor, **para importar e nunca recopiar**:
`app/lib/ticket-status.ts`, `app/lib/ticket-priority.ts`.

## Do's and Don'ts

**Faça**

- Separe por superfície e sombra; deixe a cor para o que muda de estado.
- Pegue cor de token. Se não existir token para o que você precisa, o token é
  que está faltando.
- Confira contraste nos **dois** temas antes de fechar.
- Use `tabular-nums` em todo número alinhado.
- Prefira o componente que já existe a mais uma variante.

**Não faça**

- Paleta crua do Tailwind (`slate-800`, `zinc-700`, `gray-400`). São o modo de
  ignorar o tema — a tela vira bloco escuro dentro de página clara. Duas
  exceções, ambas registradas no código: o sub-tema `devops-theme` e os blocos
  de código do `api-docs`.
- Borda em volta de painel. Já foi removida do portal inteiro; recolocar
  desfaz a varredura.
- Esticar tinta de distintivo por área grande. `status-*` e `sem-*` foram
  desenhados para etiqueta de 20px; numa faixa de 56px viram lama.
- `text-white` fixo. Quando a superfície abaixo seguir o tema, vira branco no
  branco. Só sobre cor forte declarada.
- Azul cheio da marca como fundo de texto branco (2,73:1).
- `bg-background` em painel — é a cor da página.
- Borda colorida acima de 1px, exceto o trilho de prioridade do Kanban.

---

*Escrito em 10/09/2026, a partir dos tokens em `app/globals.css` e
`app/styles/*.css` e das varreduras `66fec1e` (borda→elevação) e `5d12340`
(paleta→token). Quando o código e este arquivo divergirem, o código é a
verdade — e este arquivo está desatualizado.*
