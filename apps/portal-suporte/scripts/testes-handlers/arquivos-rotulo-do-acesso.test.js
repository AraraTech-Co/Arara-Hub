// O seletor de "quem pode ver" em Arquivos diz o que de fato faz.
//
// A lista de permissões aparecia como "Só quem tem: Projetos", que se lê como
// um GRUPO de pessoas. Projetos e Planejamento são portas de módulo, não
// times — e desde que o acesso ao módulo passou a ser o campo "Projetos" em
// Editar membro, o rótulo antigo ficou prometendo uma coisa e fazendo outra.
//
// Aqui se prova o que a TELA mostra, por texto, porque o valor do `<option>`
// (`grant:<key>`) continua o mesmo e é ele que o servidor lê — quem muda é só
// o que a pessoa lê na hora de escolher.
//
// Roda com: node arquivos-rotulo-do-acesso.test.js
const { ok, fim } = require('./_carregar.js')
const { registrarTS, importarTela, semComentarios } = require('./_tela.js')

registrarTS([])

;(async () => {
  const G = await importarTela('lib/auth/feature-grants.ts')
  const tela = semComentarios('(admin)/admin/arquivos/page.tsx')

  ok('o-rotulo-diz-que-e-permissao',
    tela.includes('Só quem tem a permissão: {g.label}'), null)
  ok('o-rotulo-antigo-saiu',
    !tela.includes('Só quem tem: {g.label}'), null)
  // A descrição é onde se descobre o que a permissão abre; sem ela o rótulo
  // continua sendo só um nome.
  ok('a-descricao-da-permissao-fica-ao-alcance',
    tela.includes('title={g.description}'), null)
  // O VALOR não muda: é o contrato com o servidor. Trocar o rótulo e o valor
  // junto quebraria o ACL de todo arquivo já enviado.
  ok('o-valor-enviado-ao-servidor-nao-mudou',
    tela.includes('value={`grant:${g.key}`}'), null)

  // Toda permissão da lista tem rótulo e descrição próprios — senão o `title`
  // viria vazio para alguma e a tela mentiria por omissão.
  const sem = G.FEATURE_GRANTS.filter(
    (g) => !g.label || !g.description || g.description.length < 20)
  ok('toda-permissao-tem-rotulo-e-descricao', sem.length === 0, sem.map((g) => g.key))
  ok('as-portas-de-modulo-estao-na-lista',
    G.FEATURE_GRANTS.some((g) => g.key === 'projetos')
    && G.FEATURE_GRANTS.some((g) => g.key === 'planejamento'),
    G.FEATURE_GRANTS.map((g) => g.key))

  fim()
})()
