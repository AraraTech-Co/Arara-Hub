// Valida o routes.generated.ts do Horas INTEIRO: compila CADA handler pelo
// mesmo caminho do compileController e confere que todos exportam handler.
// node --check sozinho não basta — handler sem module.exports já derrubou a API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todosHandlers, compilar } from './_carregar.mjs';

test('todos os handlers do gerado compilam e exportam handler', () => {
  const rotas = todosHandlers();
  assert.ok(rotas.length > 0, 'nenhum handler encontrado');
  let ok = 0;
  const falhas = [];
  for (const r of rotas) {
    try {
      const h = compilar(r.code);
      assert.equal(typeof h, 'function');
      ok += 1;
    } catch (e) {
      falhas.push(`${r.method} ${r.path}: ${e.message}`);
    }
  }
  console.log(`handlers validados: ${ok}/${rotas.length}`);
  assert.deepEqual(falhas, [], 'handlers que não compilam:\n' + falhas.join('\n'));
});
