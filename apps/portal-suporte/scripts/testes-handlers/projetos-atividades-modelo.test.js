// O modelo das atividades e as rotas não podem divergir.
//
// São dois arquivos diferentes — `projetos-atividades-modelo.py` declara os
// campos na plataforma, `projetos-atividades.py` grava e projeta — e nada no
// caminho normal reclama se um ganhar campo que o outro não tem. Campo gravado
// que não está declarado fica num registro que a plataforma não sabe descrever;
// campo declarado que ninguém grava nem lê é campo que ninguém mantém.
//
// Este teste é estrutural: compara as DUAS listas nos dois sentidos, e compara
// cada campo que o handler GRAVA com o que está declarado.
const { carregarContexto, ok, fim } = require('./_carregar.js')
const fs = require('fs')
const path = require('path')

const MODELO = path.resolve(__dirname, '../projetos-atividades-modelo.py')
const ROTAS = path.resolve(__dirname, '../../../../packages/api/src/apps/portal-suporte/routes.generated.ts')

/** Campos declarados de um model, recortados pela âncora da declaração. */
function camposDeclarados(texto, alias) {
  const abre = `model("${alias}", {`
  if (texto.split(abre).length - 1 !== 1) return null
  const i = texto.indexOf(abre)
  // O bloco termina no `}),` da coluna 4 — o mesmo recuo em que `model(` abre.
  const fim_ = texto.indexOf('\n    }),', i)
  if (fim_ < 0) return null
  const bloco = texto.slice(i + abre.length, fim_)
  // Só as chaves no recuo do campo: `        "nome": {`. Comentário é linha
  // que começa com `#`, e aqui não casa porque a busca exige a chave entre
  // aspas seguida de dois-pontos e abre-chaves.
  return (bloco.match(/^\s{8}"(\w+)":\s*\{/gm) || []).map((l) => l.match(/"(\w+)"/)[1])
}

/** Chaves do objeto passado a um `create` dentro do handler. */
function camposGravados(codigo, chamada) {
  const i = codigo.indexOf(chamada)
  if (i < 0) return null
  const j = codigo.indexOf('});', i)
  if (j < 0) return null
  const bloco = codigo.slice(i, j)
  return (bloco.match(/^\s+(\w+):/gm) || []).map((l) => l.trim().replace(':', ''))
}

/** O literal de um handler, pela marca do cabeçalho. */
function fonteDoHandler(marca) {
  const texto = fs.readFileSync(ROTAS, 'utf8')
  const at = texto.indexOf(marca)
  if (at < 0) return ''
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  const m = re.exec(texto)
  return m ? JSON.parse('"' + m[1] + '"') : ''
}

const modelo = fs.readFileSync(MODELO, 'utf8')

// ── ProjetoAtividade: declarado × projetado ──────────────────────────────────
{
  const declarados = camposDeclarados(modelo, 'ProjetoAtividade')
  ok('modelo-da-atividade-foi-recortado', Array.isArray(declarados) && declarados.length > 0, declarados)

  const ctx = carregarContexto('projetos GET /projetos/:id/atividades')
  const projetados = ctx._CAMPOS_ATIV
  ok('rota-expoe-a-lista-de-campos', Array.isArray(projetados) && projetados.length > 0, projetados)

  const faltaNoModelo = (projetados || []).filter((c) => !(declarados || []).includes(c))
  const faltaNaRota = (declarados || []).filter((c) => !(projetados || []).includes(c))
  ok('todo-campo-projetado-esta-declarado', faltaNoModelo.length === 0, faltaNoModelo)
  ok('todo-campo-declarado-e-projetado', faltaNaRota.length === 0, faltaNaRota)
}

// ── ProjetoAtividade: declarado × o que o POST grava ─────────────────────────
{
  const declarados = camposDeclarados(modelo, 'ProjetoAtividade') || []
  const gravados = camposGravados(fonteDoHandler('projetos POST /projetos/:id/atividades'), 'var nova = {')
  ok('campos-gravados-foram-recortados', Array.isArray(gravados) && gravados.length > 0, gravados)
  const naoDeclarados = (gravados || []).filter((c) => !declarados.includes(c))
  ok('todo-campo-gravado-esta-declarado', naoDeclarados.length === 0, naoDeclarados)
  // O POST grava o cadastro inteiro: nenhum campo declarado fica de fora da
  // criação, senão o registro nasce sem ele e a leitura devolve `undefined`.
  const naoGravados = declarados.filter((c) => !(gravados || []).includes(c))
  ok('todo-campo-declarado-e-gravado-na-criacao', naoGravados.length === 0, naoGravados)
}

// ── ProjetoAtividadeEvento: declarado × o que o histórico grava ──────────────
{
  const declarados = camposDeclarados(modelo, 'ProjetoAtividadeEvento')
  ok('modelo-do-evento-foi-recortado', Array.isArray(declarados) && declarados.length > 0, declarados)
  const gravados = camposGravados(fonteDoHandler('projetos POST /projetos/:id/atividades'), 'await L.create({')
  ok('campos-do-evento-foram-recortados', Array.isArray(gravados) && gravados.length > 0, gravados)
  const naoDeclarados = (gravados || []).filter((c) => !(declarados || []).includes(c))
  const naoGravados = (declarados || []).filter((c) => !(gravados || []).includes(c))
  ok('todo-campo-do-evento-esta-declarado', naoDeclarados.length === 0, naoDeclarados)
  ok('todo-campo-declarado-do-evento-e-gravado', naoGravados.length === 0, naoGravados)
}

// ── O modelo não declara o que a decisão B proíbe ────────────────────────────
{
  const declarados = (camposDeclarados(modelo, 'ProjetoAtividade') || []).join(',')
  // Campo apontando para card Dev faria a atividade voltar a depender dele —
  // é a decisão B desfeita por um campo.
  for (const proibido of ['ticket_id', 'card_id', 'quadro', 'progresso']) {
    ok('modelo-sem-campo-de-card:' + proibido, !declarados.split(',').includes(proibido), declarados)
  }
}

fim()
