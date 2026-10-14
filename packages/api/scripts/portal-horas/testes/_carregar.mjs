// Carrega handlers compilados direto do routes.generated.ts do Horas, pelo
// MESMO caminho do compileController (new Function → module.exports.handler).
// Testar o gerado (e não a fonte legível) é o que prova o que vai a produção.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GEN = path.resolve(
  __dirname,
  '../../../src/apps/portal-horas/routes.generated.ts',
);
export const FONTE_LEGIVEL = path.resolve(__dirname, '../users-write-controller.js');

/** Extrai {method, path, code} de cada rota com handler compilado. */
export function todosHandlers() {
  const text = fs.readFileSync(GEN, 'utf8');
  const out = [];
  let cur = {};
  for (const line of text.split('\n')) {
    const m = line.match(/method:\s*"([A-Z]+)"/);
    if (m) cur.method = m[1];
    const p = line.match(/path:\s*"([^"]*)"/);
    if (p) cur.path = p[1];
    if (line.includes('handler: compileController(')) {
      const a = line.indexOf('"');
      const b = line.lastIndexOf('"');
      if (a >= 0 && b > a) {
        cur.code = JSON.parse(line.slice(a, b + 1));
        out.push({ ...cur });
        cur = {};
      }
    }
  }
  return out;
}

/** Replica compileController: compila o código e devolve a função handler. */
export function compilar(code) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('module', 'exports', `${code}\n;return module.exports;`);
  const mod = { exports: {} };
  const exported = factory(mod, mod.exports);
  const bag = exported && typeof exported === 'object' ? exported : mod.exports;
  const h =
    typeof bag === 'function'
      ? bag
      : bag && typeof bag.handler === 'function'
        ? bag.handler
        : bag && typeof bag.default === 'function'
          ? bag.default
          : null;
  if (typeof h !== 'function') throw new Error('Controller não exporta handler(ctx)');
  return h;
}

export function carregarHandler(method, routePath) {
  const hit = todosHandlers().find((h) => h.method === method && h.path === routePath);
  if (!hit) throw new Error(`handler ${method} ${routePath} não encontrado no gerado`);
  return compilar(hit.code);
}

/** Código (com MAP inlined) do handler de uma rota — para o teste de coerência. */
export function codigoHandler(method, routePath) {
  const hit = todosHandlers().find((h) => h.method === method && h.path === routePath);
  if (!hit) throw new Error(`handler ${method} ${routePath} não encontrado`);
  return hit.code;
}
