const fs = require('node:fs')
const path = require('node:path')
const { ok, fim } = require('./_carregar.js')
const { registrarTS, importarTela, semComentarios, APP } = require('./_tela.js')

// Sem variante nenhuma: o que `registrarTS` instala e este teste precisa é o
// resolvedor dos imports relativos sem extensão do `.ts` da tela. A variante da
// transição saiu junto com a constante que ela virava.
registrarTS([])

const CAMINHO = path.join(APP, 'lib/auth/feature-grants.ts')
const REL = 'lib/auth/feature-grants.ts'

const QUEM = {
  'master':             { role: 'master',    featureGrants: [] },
  'admin':              { role: 'admin',     featureGrants: [] },
  'developer':          { role: 'developer', featureGrants: [] },
  'developer+projetos': { role: 'developer', featureGrants: ['projetos'] },
  'support+qa':         { role: 'support',   featureGrants: ['qa'] },
  'support+planejamento': { role: 'support', featureGrants: ['planejamento'] },
  'support':            { role: 'support',   featureGrants: [] },
  'user+projetos':      { role: 'user',      featureGrants: ['projetos'] },
  'support+projetos':   { role: 'support',   featureGrants: ['projetos'] },
  'user':               { role: 'user',      featureGrants: [] },
  'sem-grants':         { role: 'user' },
}

;(async () => {
const G = await importarTela(REL)

// ── 1. O campo existe e é concedível ────────────────────────────────────────
{
  const chaves = G.FEATURE_GRANTS.map((g) => g.key)
  ok('catalogo-tem-o-campo-projetos', chaves.includes('projetos'), chaves)
  const entrada = G.FEATURE_GRANTS.find((g) => g.key === 'projetos')
  ok('campo-tem-rotulo-e-explicacao',
    !!entrada && entrada.label === 'Projetos' && (entrada.description || '').length > 40, entrada)
  // Sem passar pelo saneador, o toggle marca e a gravação descarta em silêncio.
  ok('gravacao-aceita-o-campo', G.sanitizeGrants(['projetos']).includes('projetos'),
    G.sanitizeGrants(['projetos']))
  ok('gravacao-continua-descartando-chave-desconhecida',
    G.sanitizeGrants(['projetos', 'inventado']).join(',') === 'projetos',
    G.sanitizeGrants(['projetos', 'inventado']))
  // "Planejamento de projetos" continua SEPARADO — é a decisão do Leonardo.
  ok('planejamento-continua-sendo-outro-campo', chaves.includes('planejamento'), chaves)
  ok('planejamento-e-projetos-sao-chaves-distintas',
    chaves.filter((k) => k === 'projetos' || k === 'planejamento').length === 2, chaves)
}

// ── 2. A régua da tela ──────────────────────────────────────────────────────
//
// Decisão do Leonardo (30/10): "libera projetos para todos os membros, mas quem
// vai ter acesso aos projetos é na área de membros que eu decido, selecionando
// as caixas e dando permissão". A porta antiga — developer+ por cargo, ou o
// grant `qa` como passe — saiu, e a constante de transição com ela.
{
  const fonte = fs.readFileSync(CAMINHO, 'utf8')
  ok('a-constante-da-transicao-nao-existe-mais',
    !fonte.includes('PORTA_ANTIGA_DE_PROJETOS'), null)

  const esperado = {
    'master': true, 'admin': true,
    // `user` é o nível do CLIENTE: a caixa marcada não abre projeto interno.
    'user+projetos': false, 'support+projetos': true, 'developer+projetos': true,
    'developer': false, 'support+qa': false,
    // Quem planeja vê sem o campo (decisão de 29/10, que segue valendo).
    'support+planejamento': true,
    'support': false, 'user': false, 'sem-grants': false,
  }
  const vistos = {}
  for (const quem of Object.keys(esperado)) vistos[quem] = G.canVerProjetos(QUEM[quem])
  for (const quem of Object.keys(esperado)) {
    ok(`tela:${quem}=${esperado[quem]}`, vistos[quem] === esperado[quem], vistos)
  }
  // O campo é a causa: o mesmo cargo, só a caixa muda. Sem este contraste,
  // "developer é false" passaria também numa função que devolvesse false para
  // todo mundo.
  ok('o-campo-e-a-causa-da-diferenca-na-tela',
    G.canVerProjetos(QUEM['developer']) === false
    && G.canVerProjetos(QUEM['developer+projetos']) === true, null)
}

// ── 3. Ver não é planejar ───────────────────────────────────────────────────
{
  // O campo "Projetos" NÃO libera planejar, e o grant `planejamento` não é
  // exigido para ver. São duas portas, e trocá-las daria acesso que ninguém pediu.
  ok('campo-projetos-nao-libera-planejar',
    G.canVerProjetos(QUEM['support+projetos']) === true
    && G.canPlanejar(QUEM['support+projetos']) === false, {
      ve: G.canVerProjetos(QUEM['support+projetos']),
      planeja: G.canPlanejar(QUEM['support+projetos']),
    })
  const soPlanejamento = { role: 'support', featureGrants: ['planejamento'] }
  // MUDOU em 29/10: quem planeja passou a ver. Antes isto afirmava o contrário,
  // e o contrário era o buraco — a pessoa criava atividade e não listava.
  ok('planejamento-agora-da-acesso-ao-modulo',
    G.canPlanejar(soPlanejamento) === true && G.canVerProjetos(soPlanejamento) === true, {
      planeja: G.canPlanejar(soPlanejamento),
      ve: G.canVerProjetos(soPlanejamento),
    })
}

// ── 4. Tela e servidor dizem a mesma coisa ──────────────────────────────────
//
// As duas réguas são código diferente em linguagens diferentes. O que amarra
// as duas é esta comparação: a mesma tabela-verdade do teste do servidor,
// conferida contra a função da tela.
{
  const servidor = {
    'master': true, 'admin': true, 'user+projetos': false, 'developer+projetos': true,
    'developer': false, 'support+qa': false, 'support': false, 'user': false,
    'support+planejamento': true,
  }
  const divergem = Object.keys(servidor)
    .filter((quem) => G.canVerProjetos(QUEM[quem]) !== servidor[quem])
  ok('tela-e-servidor-nao-divergem', divergem.length === 0, divergem)
}

// ── 4b. O espelho do catálogo nos handlers de arquivos ──────────────────────
//
// Os handlers 490a1–a4 têm um `GRANTS_VALIDOS` que se declara espelho deste
// catálogo: grant fora da lista é RECUSADO no POST, porque trancaria o arquivo
// para todos menos admin. Espelho que fica para trás não acusa nada sozinho —
// o grant novo simplesmente não pode ser usado, e ninguém descobre por que.
{
  const gerado = fs.readFileSync(
    path.resolve(__dirname, '../../../../packages/api/src/apps/portal-suporte/routes.generated.ts'),
    'utf8')
  const achados = [...gerado.matchAll(/var GRANTS_VALIDOS = \[([^\]]*)\]/g)]
    .map((m) => m[1].split(',').map((s) => s.trim().replace(/\\?"/g, '')))
  ok('achou-os-espelhos-nos-handlers-de-arquivos', achados.length === 4, achados.length)
  const doCatalogo = G.FEATURE_GRANTS.map((g) => g.key).sort().join(',')
  const divergentes = achados
    .map((lista, i) => [i, lista.slice().sort().join(',')])
    .filter(([, lista]) => lista !== doCatalogo)
  ok('o-espelho-do-servidor-tem-as-mesmas-chaves-do-catalogo',
    divergentes.length === 0, { doCatalogo, divergentes })
}

// ── 5. O menu usa a régua, e não uma cópia dela ─────────────────────────────
{
  const semComentario = semComentarios('_components/admin/admin-sidebar.tsx')

  const linha = semComentario.split('\n').find((l) => l.includes("href: '/admin/projetos'"))
  ok('o-item-de-projetos-existe-no-menu', !!linha, linha)
  ok('o-item-usa-canVerProjetos', !!linha && linha.includes('pode: canVerProjetos'), linha)
  // Sem isto o item voltaria a ter a porta antiga embutida na própria linha.
  ok('o-item-nao-tem-mais-porta-propria',
    !!linha && !linha.includes('minLevel') && !linha.includes('grant:'), linha)
  ok('o-filtro-honra-a-regra-propria',
    semComentario.includes('if (item.pode) return item.pode('), null)
  ok('o-menu-importa-a-regra-do-catalogo',
    semComentario.includes("canVerProjetos") && semComentario.includes("auth/feature-grants"), null)

  // O hook não refaz a conta: uma segunda cópia da régua divergiria no dia da troca.
  const hook = semComentarios('_hooks/use-meu-acesso.ts')
  ok('o-hook-expoe-podeVerProjetos', /podeVerProjetos:\s*canVerProjetos\(/.test(hook), null)
  ok('o-hook-nao-reimplementa-a-regra',
    !hook.includes("includes('projetos')") && !hook.includes('_PORTA_ANTIGA'), null)
}

fim()
})()
