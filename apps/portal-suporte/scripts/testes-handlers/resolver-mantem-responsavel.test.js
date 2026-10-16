// O botão de resolver no card mantém o responsável, como o arrastar e como o
// padrão do diálogo.
//
// Havia TRÊS portas para "resolvido" e elas divergiam:
//  1. botão ✓ no card → mandava `clear_assignee: true` FIXO e já zerava
//     `assignee`/`assigned_to` no otimista: o card ia para Resolvido sem dono,
//     sempre;
//  2. diálogo de resolver → respeita a escolha, desmarcada por padrão, e o
//     próprio texto diz que o responsável continua no card;
//  3. arrastar → nunca mandou a flag, então mantém o dono.
// Duas das três preservavam. A equipe relatou a terceira como defeito.
//
// O servidor sempre esteve certo: as rotas 390 e 410 só limpam quando a flag
// vem, e o comentário de lá diz "arrastar p/ Resolvido sem clear_assignee
// mantém o dono". Então o conserto é na tela, nos dois pontos do caminho 1.
//
// COMO ESTE TESTE AFIRMA: lendo o código publicado. O comportamento vive num
// componente React e aqui não há como renderizá-lo. Os comentários são
// REMOVIDOS antes de qualquer afirmação — o comentário que explica a correção
// contém a própria palavra `clear_assignee`, e sem isso a busca casaria com ele
// em vez de com código.
//
// Roda com: node resolver-mantem-responsavel.test.js
const fs = require('node:fs')
const path = require('node:path')
const { ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../..')
const ARQ = path.join(APP, 'app/_components/kanban/kanban-board.tsx')
const CARD = path.join(APP, 'app/_components/kanban/kanban-card.tsx')

/** Tira comentários de linha e de bloco, para as buscas verem só código. */
function soCodigo(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const fonte = soCodigo(fs.readFileSync(ARQ, 'utf8'))
const fonteCard = soCodigo(fs.readFileSync(CARD, 'utf8'))

/** O trecho do `onQuickAction` que trata 'resolve'. */
function blocoDoBotao() {
  const i = fonte.indexOf("} else if (type === 'resolve') {")
  if (i < 0) throw new Error("não achei o ramo 'resolve' do onQuickAction")
  // até o fechamento do useCallback, que tem a lista de dependências
  const fim = fonte.indexOf('}, [currentUser, tickets, toast]);', i)
  if (fim < 0) throw new Error('não achei o fim do onQuickAction')
  return fonte.slice(i, fim)
}

/** O trecho do diálogo de resolver, que NÃO deve mudar. */
function blocoDoDialogo() {
  const i = fonte.indexOf('resolveClearAssignee')
  if (i < 0) throw new Error('não achei o diálogo de resolver')
  return fonte.slice(i, fonte.indexOf('restaurarArrasto(ticketId, fromStatus)', i) + 60)
}

;(async () => {
  const botao = blocoDoBotao()

  // ══ o caminho do botão do card ════════════════════════════════════════
  ok('o botão do card NÃO manda clear_assignee',
    !/clear_assignee/.test(botao), botao.match(/.{0,60}clear_assignee.{0,40}/)?.[0])
  ok('  e manda patchStatus só com o status',
    /patchStatus\(id,\s*\{\s*status:\s*'resolvido'\s*\}\)/.test(botao),
    botao.match(/patchStatus\([^)]*\)/)?.[0])
  ok('  o otimista NÃO zera o responsável',
    !/assignee:\s*null/.test(botao.slice(0, botao.indexOf('try {'))),
    botao.slice(0, botao.indexOf('try {')).match(/.{0,50}assignee:\s*null.{0,20}/)?.[0])
  ok('  e põe o card em resolvido',
    /status:\s*'resolvido'\s*\}/.test(botao), 'o otimista deixou de marcar resolvido')

  // ══ o que NÃO podia mudar ═════════════════════════════════════════════
  //
  // Afirmo sobre a ocorrência ÚNICA de `clear_assignee`, não sobre um recorte
  // de bloco: minha primeira versão recortava do `useState` até o primeiro
  // `restaurarArrasto`, e esse aparece ANTES do trecho do diálogo — o recorte
  // fechava cedo e as afirmações mediam o lugar errado.
  const ocorrencias = fonte.match(/clear_assignee/g) || []
  ok("há exatamente UMA menção a clear_assignee no arquivo", ocorrencias.length === 1, ocorrencias.length)
  ok("  e ela é a condicional do diálogo, não um valor fixo",
    /\.\.\.\(resolveClearAssignee \? \{ clear_assignee: true \} : \{\}\)/.test(fonte),
    fonte.match(/.{0,60}clear_assignee.{0,30}/)?.[0])
  ok("  a caixa do diálogo nasce desmarcada",
    /const \[resolveClearAssignee, setResolveClearAssignee\] = useState\(false\)/.test(fonte),
    "o padrão do diálogo mudou")

  // As outras quatro chamadas de patchStatus do arquivo — inclusive as duas do
  // arrastar — seguem sem a flag, que é o comportamento que já estava certo.
  const chamadas = fonte.match(/patchStatus\([^;]*?\)/gs) || []
  ok("as outras chamadas de patchStatus seguem sem a flag",
    chamadas.filter((c) => /clear_assignee/.test(c)).length === 1, chamadas.length + " chamadas")

  // ══ o botão continua existindo e chamando a ação ══════════════════════
  ok('o botão ✓ do card continua chamando a ação de resolver',
    /onQuickAction\(ticket\.id,\s*'resolve'\)/.test(fonteCard),
    'o botão do card deixou de chamar resolve')

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
