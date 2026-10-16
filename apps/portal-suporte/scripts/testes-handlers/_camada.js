// O `findMany` da camada de modelos (packages/api/src/lib/models.ts), emulado no
// que o resultado depende. Existe para os mocks dos testes de handlers não
// divergirem da camada de verdade, que foi o defeito de vários deles hoje.
//
// O que ele reproduz — e que o teste de premissas contra Postgres real
// (packages/api/scripts/testes/camada-premissas-do-emulador.test.mjs) confere:
//   - o filtro por campo é aplicado ANTES do teto;
//   - a ordem é a de criação, a MAIS RECENTE primeiro;
//   - o teto é 500 por leitura (`limit` até 500) e `offset` pula linhas;
//   - `limit`, `offset` e `mascararCampos` (entre outras) NÃO são campos de filtro
//     (`metaKeys`);
//   - `mascararCampos` troca por "1" o que é verdadeiro em JS e deixa o que é falso
//     (a regra do #77, provada contra Postgres em mascarar-campos.test.mjs).
const META = ['limit', 'offset', 'page', 'pageSize', 'perPage', 'sort', 'order', 'orderBy', 'q', 'search', 'include', 'fields', 'mascararCampos']

/** @param linhas em ORDEM DE CRIAÇÃO (a mais antiga primeiro), como se gravou. */
function camadaFindMany(linhas, arg) {
  const filtro = arg || {}
  const campos = Object.keys(filtro).filter((k) => !META.includes(k))
  const take = Math.min(500, Math.max(1, Number(filtro.limit ?? filtro.pageSize ?? filtro.perPage) || 500))
  const offset = Math.max(0, Number(filtro.offset) || 0)
  const mascarar = Array.isArray(filtro.mascararCampos) ? filtro.mascararCampos : []
  return linhas
    .filter((m) => campos.every((k) => String(m[k] ?? '') === String(filtro[k])))
    .slice().reverse()                       // a mais recente primeiro
    .slice(offset, offset + take)
    .map((m) => {
      const c = { ...m }
      for (const k of mascarar) if (k in c && c[k]) c[k] = '1'
      return c
    })
}

module.exports = { camadaFindMany, META }
