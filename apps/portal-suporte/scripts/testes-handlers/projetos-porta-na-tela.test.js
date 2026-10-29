// A porta de Projetos na TELA — o campo em Editar membro e o que ele libera.
//
// O servidor é a verdade (ver projetos-porta-de-acesso.test.js). Isto aqui é
// sobre a tela: o campo tem de EXISTIR no catálogo (senão ninguém consegue
// conceder), ser aceito na gravação, e o menu tem de esconder e mostrar pela
// MESMA régua do servidor — senão a pessoa vê um item que a API recusa, ou
// deixa de ver um módulo que ela pode abrir.
//
// POR QUE EXECUTAR O MÓDULO, E NÃO LER O TEXTO DELE:
// uma tabela-verdade lida por `grep` afirma sobre a letra, não sobre o
// resultado. `canVerProjetos` é uma função de cinco linhas com duas portas e
// uma constante — é exatamente o tipo de regra que passa no olho e erra no
// caso de borda. Então o teste IMPORTA o `.ts` de verdade: o Node 26 apaga os
// tipos, e um par de ganchos resolve o que o TypeScript resolveria (extensão
// omitida e o JSON de configuração).
//
// Roda com: node projetos-porta-na-tela.test.js
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { registerHooks } = require('node:module')
const { ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../../app')
const MARCA_DA_TROCA = 'porta=desligada'

registerHooks({
  resolve(esp, ctx, proximo) {
    // Especificador relativo sem extensão: o que o `tsc` resolveria para .ts.
    if (/^\.{1,2}\//.test(esp) && !path.extname(esp) && ctx.parentURL) {
      const base = path.dirname(ctx.parentURL.replace('file://', ''))
      const alvo = path.resolve(decodeURIComponent(base), esp + '.ts')
      if (fs.existsSync(alvo)) return { url: pathToFileURL(alvo).href, shortCircuit: true }
    }
    return proximo(esp, ctx)
  },
  load(url, ctx, proximo) {
    // A variante do DIA DA TROCA: o mesmo módulo com a constante em `false`.
    //
    // `PORTA_ANTIGA_DE_PROJETOS` é constante de módulo — não há como virá-la em
    // tempo de execução, e sem virar ninguém prova o que a troca faz. Então o
    // gancho serve uma SEGUNDA instância do mesmo arquivo com a única linha da
    // constante trocada, e a troca exige ocorrência única: se o arquivo mudar
    // de forma, o teste para em vez de servir um módulo que não é o do repo.
    if (url.includes(MARCA_DA_TROCA)) {
      const arq = decodeURIComponent(url.split('?')[0].replace('file://', ''))
      const fonte = fs.readFileSync(arq, 'utf8')
      // Sem `throw`: se a linha não casar, o módulo é servido como está e a
      // asserção nomeada `a-linha-da-constante-e-unica-e-esta-true` reprova
      // dizendo o porquê. Lançar aqui mataria o arquivo de teste antes de
      // qualquer caso rodar, e a saída não diria qual regra quebrou.
      const de = 'export const PORTA_ANTIGA_DE_PROJETOS = true'
      if (fonte.split(de).length - 1 !== 1) {
        return { format: 'module-typescript', source: fonte, shortCircuit: true }
      }
      return {
        // `module-typescript`: é o Node que apaga os tipos, o mesmo caminho do
        // arquivo original. Servir como `module` cru faria o `import type`
        // chegar ao compilador e o teste morrer de sintaxe.
        format: 'module-typescript',
        source: fonte.replace(de, 'export const PORTA_ANTIGA_DE_PROJETOS = false'),
        shortCircuit: true,
      }
    }
    // `import cfg from '....json'` sem atributo de importação: o bundler do
    // Next entrega isso; o Node, não. O gancho devolve o mesmo valor.
    if (url.endsWith('.json')) {
      const texto = fs.readFileSync(decodeURIComponent(url.replace('file://', '')), 'utf8')
      return { format: 'module', source: 'export default ' + texto, shortCircuit: true }
    }
    return proximo(url, ctx)
  },
})


const CAMINHO = path.join(APP, 'lib/auth/feature-grants.ts')

const QUEM = {
  'master':             { role: 'master',    featureGrants: [] },
  'admin':              { role: 'admin',     featureGrants: [] },
  'developer':          { role: 'developer', featureGrants: [] },
  'developer+projetos': { role: 'developer', featureGrants: ['projetos'] },
  'support+qa':         { role: 'support',   featureGrants: ['qa'] },
  'support':            { role: 'support',   featureGrants: [] },
  'user+projetos':      { role: 'user',      featureGrants: ['projetos'] },
  'user':               { role: 'user',      featureGrants: [] },
  'sem-grants':         { role: 'user' },
}

;(async () => {
const G = await import(pathToFileURL(CAMINHO).href)
const DESLIGADA = await import(pathToFileURL(CAMINHO).href + '?' + MARCA_DA_TROCA)

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

// ── 2. A régua da tela, hoje (transição ligada) ─────────────────────────────
{
  ok('a-constante-da-transicao-vem-ligada', G.PORTA_ANTIGA_DE_PROJETOS === true,
    G.PORTA_ANTIGA_DE_PROJETOS)
  // O que a variante do dia da troca depende para existir. Dito por asserção
  // e não por exceção: assim a falha nomeia a regra em vez de matar o arquivo.
  {
    const fonte = fs.readFileSync(CAMINHO, 'utf8')
    const linha = 'export const PORTA_ANTIGA_DE_PROJETOS = true'
    ok('a-linha-da-constante-e-unica-e-esta-true',
      fonte.split(linha).length - 1 === 1, fonte.split(linha).length - 1)
  }
  const esperado = {
    'master': true, 'admin': true,
    'user+projetos': true, 'developer+projetos': true,
    'developer': true, 'support+qa': true,
    'support': false, 'user': false, 'sem-grants': false,
  }
  const vistos = {}
  for (const quem of Object.keys(esperado)) vistos[quem] = G.canVerProjetos(QUEM[quem])
  for (const quem of Object.keys(esperado)) {
    ok(`tela-hoje:${quem}=${esperado[quem]}`, vistos[quem] === esperado[quem], vistos)
  }
}

// ── 3. Ver não é planejar ───────────────────────────────────────────────────
{
  // O campo "Projetos" NÃO libera planejar, e o grant `planejamento` não é
  // exigido para ver. São duas portas, e trocá-las daria acesso que ninguém pediu.
  ok('campo-projetos-nao-libera-planejar',
    G.canVerProjetos(QUEM['user+projetos']) === true
    && G.canPlanejar(QUEM['user+projetos']) === false, {
      ve: G.canVerProjetos(QUEM['user+projetos']),
      planeja: G.canPlanejar(QUEM['user+projetos']),
    })
  const soPlanejamento = { role: 'user', featureGrants: ['planejamento'] }
  ok('planejamento-sozinho-nao-da-acesso-ao-modulo-hoje',
    G.canPlanejar(soPlanejamento) === true && G.canVerProjetos(soPlanejamento) === false, {
      planeja: G.canPlanejar(soPlanejamento),
      ve: G.canVerProjetos(soPlanejamento),
    })
}

// ── 3b. O dia da troca, na tela ─────────────────────────────────────────────
{
  ok('a-variante-da-troca-e-o-mesmo-modulo-com-a-constante-virada',
    DESLIGADA.PORTA_ANTIGA_DE_PROJETOS === false
    && DESLIGADA.FEATURE_GRANTS.length === G.FEATURE_GRANTS.length,
    DESLIGADA.PORTA_ANTIGA_DE_PROJETOS)
  const esperado = {
    'master': true, 'admin': true,
    'user+projetos': true, 'developer+projetos': true,
    'developer': false, 'support+qa': false,
    'support': false, 'user': false,
  }
  const vistos = {}
  for (const quem of Object.keys(esperado)) vistos[quem] = DESLIGADA.canVerProjetos(QUEM[quem])
  for (const quem of Object.keys(esperado)) {
    ok(`tela-troca:${quem}=${esperado[quem]}`, vistos[quem] === esperado[quem], vistos)
  }
  // O que prova que a constante é a causa: os MESMOS perfis nas duas instâncias.
  ok('a-constante-e-a-causa-da-diferenca-na-tela',
    G.canVerProjetos(QUEM['developer']) === true
    && DESLIGADA.canVerProjetos(QUEM['developer']) === false, null)
  ok('no-dia-da-troca-planejamento-sozinho-nao-ve-o-modulo',
    DESLIGADA.canVerProjetos({ role: 'user', featureGrants: ['planejamento'] }) === false, null)
}

// ── 4. Tela e servidor dizem a mesma coisa ──────────────────────────────────
//
// As duas réguas são código diferente em linguagens diferentes. O que amarra
// as duas é esta comparação: a mesma tabela-verdade do teste do servidor,
// conferida contra a função da tela.
{
  const servidor = {
    'master': true, 'admin': true, 'user+projetos': true, 'developer+projetos': true,
    'developer': true, 'support+qa': true, 'support': false, 'user': false,
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
  const texto = fs.readFileSync(path.join(APP, '_components/admin/admin-sidebar.tsx'), 'utf8')
  // Sem comentários: o comentário que EXPLICA a decisão cita os mesmos nomes
  // que a busca procura, e acharia a palavra sem que o código a use.
  const semComentario = texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')

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
  const hook = fs.readFileSync(path.join(APP, '_hooks/use-meu-acesso.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  ok('o-hook-expoe-podeVerProjetos', /podeVerProjetos:\s*canVerProjetos\(/.test(hook), null)
  ok('o-hook-nao-reimplementa-a-regra',
    !hook.includes("includes('projetos')") && !hook.includes('_PORTA_ANTIGA'), null)
}

fim()
})()
