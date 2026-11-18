import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todosHandlers, compilar, GEN } from './_carregar.mjs';
import { gerarTexto, ROTAS } from '../gerar-rotas.mjs';

test('todos os literais da Central compilam e exportam handler', () => {
  const rotas = todosHandlers();
  assert.equal(rotas.length, ROTAS.length, 'número de rotas no gerado');
  let ok = 0;
  for (const r of rotas) {
    assert.equal(typeof compilar(r.code), 'function', `${r.method} ${r.path}`);
    ok += 1;
  }
  console.log(`literais compilados: ${ok}/${rotas.length}`);
});

test('toda rota da Central é authMode actor', () => {
  for (const r of todosHandlers()) assert.equal(r.authMode, 'actor', `${r.method} ${r.path}`);
});

test('o gerado é idêntico ao que a fonte legível produz', { skip: !!process.env.CG_GEN }, () => {
  assert.equal(fs.readFileSync(GEN, 'utf8'), gerarTexto());
});
