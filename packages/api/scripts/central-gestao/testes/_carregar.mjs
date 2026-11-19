// Carrega os handlers do routes.generated.ts da Central pelo MESMO caminho do
// compileController (new Function → module.exports.handler, e o mesmo `reply`).
// CG_GEN aponta para uma cópia mutada (usado pelo mutacao.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const GEN = process.env.CG_GEN || path.resolve(AQUI, '../../../src/apps/central-gestao/routes.generated.ts');
// Arquivos das fontes (o mutacao.mjs aponta para cópias mutadas por estas variáveis).
export function arqGerado(app) {
  return process.env['CG_GEN_' + app.replace(/-/g, '_').toUpperCase()] || path.resolve(AQUI, '../../../src/apps', app, 'routes.generated.ts');
}
export const CRM_TS = process.env.CG_CRM_TS || path.resolve(AQUI, '../../../src/apps/portal-crm/resumo-gestao.ts');

export function todosHandlers(texto = fs.readFileSync(GEN, 'utf8')) {
  const out = [];
  let cur = {};
  for (const line of texto.split('\n')) {
    const m = line.match(/^    method:\s*"([A-Z]+)"/);
    if (m) cur.method = m[1];
    const p = line.match(/^    path:\s*"([^"]*)"/);
    if (p) cur.path = p[1];
    const a = line.match(/^    authMode:\s*"([^"]*)"/);
    if (a) cur.authMode = a[1];
    if (line.startsWith('    handler: compileController(')) {
      const i = line.indexOf('"');
      const j = line.lastIndexOf('"');
      cur.code = JSON.parse(line.slice(i, j + 1));
      out.push(cur);
      cur = {};
    }
  }
  return out;
}

// Cópia fiel de packages/api/src/lib/compile-controller.ts.
export function compilar(controllerCode) {
  const factory = new Function('module', 'exports', `${controllerCode}\n;return module.exports;`);
  const module = { exports: {} };
  const exported = factory(module, module.exports);
  const bag = exported && typeof exported === 'object' ? exported : module.exports;
  let resolved = bag;
  if (typeof bag === 'function') resolved = bag;
  else if (bag && typeof bag.default === 'function') resolved = bag.default;
  else if (bag && typeof bag.handler === 'function') resolved = bag.handler;
  if (typeof resolved !== 'function') throw new Error('Controller must export handler(ctx) via module.exports');
  const userHandler = resolved;
  return async (ctx) => {
    let status = 200;
    let sent;
    const reply = {
      send(value) { sent = value; return { status, body: value }; },
      status(code) { status = code; return this; },
    };
    const result = await userHandler({ ...ctx, reply });
    if (sent !== undefined) return { status, body: sent };
    if (result && typeof result === 'object' && 'body' in result) return { status: result.status || status, body: result.body };
    return { status, body: result == null ? null : result };
  };
}

const cache = new Map();
export function handler(method, rota) {
  const k = method + ' ' + rota;
  if (!cache.has(k)) {
    const hit = todosHandlers().find((h) => h.method === method && h.path === rota);
    if (!hit) throw new Error(`handler ${k} não encontrado no gerado`);
    cache.set(k, compilar(hit.code));
  }
  return cache.get(k);
}
