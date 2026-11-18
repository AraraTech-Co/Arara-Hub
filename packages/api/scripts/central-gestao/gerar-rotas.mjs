// Gera packages/api/src/apps/central-gestao/routes.generated.ts a partir da fonte
// legível desta pasta. Escreve SÓ o arquivo da Central: não é o codegen geral
// (`npm run codegen:routes`), que não deve ser rodado neste repositório.
//
//   node scripts/central-gestao/gerar-rotas.mjs            grava o arquivo
//   node scripts/central-gestao/gerar-rotas.mjs --conferir sai com 1 se o arquivo não bate com a fonte
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const GERADO = path.resolve(AQUI, '../../src/apps/central-gestao/routes.generated.ts');

export const ROTAS = [
  { arquivo: 'me-controller.js', module: 'perfil', method: 'GET', path: '/me' },
  { arquivo: 'membros-controller.js', module: 'perfil', method: 'GET', path: '/membros' },
  { arquivo: 'cartoes-list-controller.js', module: 'kanban', method: 'GET', path: '/cartoes' },
  { arquivo: 'cartoes-create-controller.js', module: 'kanban', method: 'POST', path: '/cartoes' },
  { arquivo: 'cartoes-patch-controller.js', module: 'kanban', method: 'PATCH', path: '/cartoes/:id' },
  { arquivo: 'cartoes-arquivar-controller.js', module: 'kanban', method: 'POST', path: '/cartoes/:id/arquivar' },
  { arquivo: 'cartoes-restaurar-controller.js', module: 'kanban', method: 'POST', path: '/cartoes/:id/restaurar' },
  { arquivo: 'cartoes-eventos-controller.js', module: 'kanban', method: 'GET', path: '/cartoes/:id/eventos' },
];

export function codigoDaRota(arquivo) {
  const comum = fs.readFileSync(path.join(AQUI, '_comum.js'), 'utf8');
  const rota = fs.readFileSync(path.join(AQUI, arquivo), 'utf8');
  return (
    'async function handler(ctx) {\n' +
    comum +
    '\n' +
    rota +
    '\nreturn _rota(ctx);\n}\nmodule.exports = { handler };\n'
  );
}

export function gerarTexto() {
  const partes = [
    '/** Gerado por packages/api/scripts/central-gestao/gerar-rotas.mjs a partir da fonte legível. Não editar à mão. */',
    "import type { StaticRoute } from '../../lib/handler-ctx.js'",
    "import { compileController } from '../../lib/compile-controller.js'",
    '',
    'export const CentralGestaoRoutes: StaticRoute[] = [',
  ];
  ROTAS.forEach((r, i) => {
    partes.push(
      `  // ${i} ${r.module} ${r.method} ${r.path}`,
      '  {',
      `    module: ${JSON.stringify(r.module)},`,
      `    method: ${JSON.stringify(r.method)},`,
      `    path: ${JSON.stringify(r.path)},`,
      '    authMode: "actor",',
      '    webhookSecretName: null,',
      '    requiredPermissions: [],',
      `    source: ${JSON.stringify('central-gestao/' + r.arquivo)},`,
      `    handler: compileController(${JSON.stringify(codigoDaRota(r.arquivo))}),`,
      '  },',
    );
  });
  partes.push(']', '');
  return partes.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const texto = gerarTexto();
  if (process.argv.includes('--conferir')) {
    const atual = fs.existsSync(GERADO) ? fs.readFileSync(GERADO, 'utf8') : '';
    if (atual !== texto) {
      console.error('routes.generated.ts da Central NÃO bate com a fonte legível.');
      process.exit(1);
    }
    console.log(`routes.generated.ts confere com a fonte (${ROTAS.length} rotas).`);
  } else {
    fs.mkdirSync(path.dirname(GERADO), { recursive: true });
    fs.writeFileSync(GERADO, texto);
    console.log(`gravado ${path.relative(process.cwd(), GERADO)} (${ROTAS.length} rotas).`);
  }
}
