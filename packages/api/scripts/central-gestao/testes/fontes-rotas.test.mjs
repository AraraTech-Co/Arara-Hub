// As três rotas de resumo nas fontes: estrutura dos arquivos, coerência com a fonte legível e recusas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { todosHandlers, compilar, arqGerado, CRM_TS } from './_carregar.mjs';
import { criarModel } from './_camada.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(AQUI, '../../..');
const ARQS = ['portal-suporte', 'portal-horas'].map(arqGerado).concat(path.join(API, 'src/apps/central-gestao/routes.generated.ts'));

// Avalia o arquivo inteiro como JS (sem os imports e a anotação de tipo): pega vírgula faltando entre rotas.
function avaliar(texto) {
  const js = texto.replace(/^import .*$/gm, '').replace(/export const (\w+): StaticRoute\[\]/, 'const $1');
  return new Function('compileController', js + '\n;return true;')(() => () => {});
}

for (const arq of ARQS) {
  test('arquivo de rotas é JS válido de ponta a ponta: ' + path.basename(path.dirname(arq)), () => {
    assert.equal(avaliar(fs.readFileSync(arq, 'utf8')), true);
  });
}

test('contraste: a checagem de arquivo pega uma vírgula faltando entre rotas', () => {
  const s = fs.readFileSync(path.join(API, 'src/apps/portal-horas/routes.generated.ts'), 'utf8');
  const quebrado = s.replace('\n  },\n  // 89 hour-entries', '\n  }\n  // 89 hour-entries');
  assert.notEqual(quebrado, s, 'a mutação aplicou');
  assert.throws(() => avaliar(quebrado), SyntaxError);
});

function literal(arq, metodo, rota) {
  const h = todosHandlers(fs.readFileSync(arqGerado(arq), 'utf8')).filter((x) => x.method === metodo && x.path === rota);
  assert.equal(h.length, 1, `${arq} ${rota} aparece uma vez`);
  return h[0].code;
}

test('literal do Suporte idêntico à fonte legível', { skip: !!process.env.CG_GEN_PORTAL_SUPORTE }, () => {
  assert.equal(literal('portal-suporte', 'GET', '/tickets/resumo-gestao'), fs.readFileSync(path.join(AQUI, '../fontes/suporte-tickets-resumo.js'), 'utf8'));
});
test('literal do Horas idêntico à fonte legível', { skip: !!process.env.CG_GEN_PORTAL_HORAS }, () => {
  assert.equal(literal('portal-horas', 'GET', '/hour-entries/resumo'), fs.readFileSync(path.join(API, 'scripts/portal-horas/hour-entries-resumo-controller.js'), 'utf8'));
});

const suporteH = () => compilar(literal('portal-suporte', 'GET', '/tickets/resumo-gestao'));
const horasH = () => compilar(literal('portal-horas', 'GET', '/hour-entries/resumo'));
const crm = await import(CRM_TS);
function ctxBase(user, query, models) {
  return { method: 'GET', params: {}, query, headers: {}, user, models };
}
async function chamarCrm(user, query, models) {
  let st = 200, body;
  const reply = { status(c) { st = c; return this; }, send(v) { body = v; return { status: st, body: v }; } };
  await crm.resumoDeVendas({ ...ctxBase(user, query, models), reply });
  return { status: st, body };
}
const CHAVE = { type: 'apiKey', appSlug: 'x', scopes: [] };

test('Suporte: chave sem pessoa → 401; sem Profile → 403; mês inválido → 400; contraste 200', async () => {
  const h = suporteH();
  const Ticket = criarModel('Profile');
  const Profile = criarModel('Profile');
  Profile.inserirCru('p', { id: 'u1', role: 'user' });
  const models = { Ticket, Profile };
  assert.equal((await h(ctxBase(CHAVE, { mes: '2026-11' }, models))).status, 401);
  assert.equal((await h(ctxBase({ id: 'outro', roles: ['admin'] }, { mes: '2026-11' }, models))).status, 403);
  assert.equal((await h(ctxBase({ id: 'u1', roles: [] }, { mes: '2026-13' }, models))).status, 400);
  const ok = await h(ctxBase({ id: 'u1', roles: [] }, { mes: '2026-11' }, models));
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { mes: '2026-11', complete: true, ativos: 0, sem_responsavel: 0, criados_no_mes: 0 });
  assert.equal(Ticket.gravacoes() + Profile.gravacoes(), 0);
});

test('Horas: sem pessoa → 401; analista → 403; mês inválido → 400; admin/gestor → 200', async () => {
  const h = horasH();
  const HourEntries = criarModel('Profile');
  const StaffProfile = criarModel('Profile');
  StaffProfile.inserirCru('a', { id: 'adm', role: 'admin' });
  StaffProfile.inserirCru('b', { id: 'ana', role: 'analyst' });
  StaffProfile.inserirCru('c', { id: 'ges', role: 'analyst', manager_role: true });
  const models = { HourEntries, StaffProfile };
  assert.equal((await h(ctxBase(CHAVE, { month: '2026-11' }, models))).status, 401);
  assert.equal((await h(ctxBase({ id: 'ana', roles: [] }, { month: '2026-11' }, models))).status, 403);
  assert.equal((await h(ctxBase({ id: 'adm', roles: [] }, { month: '11/2026' }, models))).status, 400);
  assert.equal((await h(ctxBase({ id: 'adm', roles: [] }, { month: '2026-11' }, models))).status, 200);
  assert.equal((await h(ctxBase({ id: 'ges', roles: [] }, { month: '2026-11' }, models))).status, 200, 'gestor lê, como em GET /hour-entries');
  const r = await h(ctxBase({ id: 'adm', roles: [] }, { month: '2026-11' }, models));
  assert.deepEqual(Object.keys(r.body).sort(), ['analysts', 'approved_minutes', 'avg_approved_minutes_per_analyst', 'complete', 'entries_counted', 'month', 'pending_minutes']);
});

test('Horas: perfil admin inativo não sai do total (como o Dashboard)', async () => {
  const h = horasH();
  const HourEntries = criarModel('Profile');
  const StaffProfile = criarModel('Profile');
  StaffProfile.inserirCru('a', { id: 'adm', role: 'admin', active: true });
  StaffProfile.inserirCru('x', { id: 'exadm', role: 'admin', active: false });
  HourEntries.inserirCru('h1', { id: 'h1', user_id: 'exadm', date: '2026-11-02', duration_minutes: 10, status: 'APPROVED' });
  HourEntries.inserirCru('h2', { id: 'h2', user_id: 'adm', date: '2026-11-02', duration_minutes: 99, status: 'APPROVED' });
  const r = await h(ctxBase({ id: 'adm', roles: [] }, { month: '2026-11' }, { HourEntries, StaffProfile }));
  assert.equal(r.body.approved_minutes, 10);
});

test('CRM: sem pessoa → 401; mês inválido → 400; contraste 200 sem dado individual', async () => {
  const Deal = criarModel('Profile');
  const Goal = criarModel('Profile');
  Deal.inserirCru('d', { id: 'd1', status: 'won', value: 10, closedAt: '2026-11-02T12:00:00Z', ownerId: 'vend' });
  const models = { Deal, Goal };
  assert.equal((await chamarCrm(CHAVE, { mes: '2026-11' }, models)).status, 401);
  assert.equal((await chamarCrm({ id: 'u', roles: [] }, { mes: '2026-1' }, models)).status, 400);
  const ok = await chamarCrm({ id: 'u', roles: [] }, { mes: '2026-11' }, models);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { mes: '2026-11', complete: true, vendido: 10, ganhos: 1, meta: null, vendedores_com_meta: 0 });
});

test('CRM: index registra a rota de resumo junto das demais (com a guarda de leitura)', () => {
  const idx = fs.readFileSync(path.join(API, 'src/apps/portal-crm/index.ts'), 'utf8');
  assert.match(idx, /aplicarGuardaDeLeitura\(\[\.\.\.rotasGeradas, \.\.\.rotasDoFunil, \.\.\.rotasDoResumoGestao\]\)/);
  assert.equal(crm.rotasDoResumoGestao.length, 1);
  assert.deepEqual([crm.rotasDoResumoGestao[0].method, crm.rotasDoResumoGestao[0].path, crm.rotasDoResumoGestao[0].authMode], ['GET', '/vendas/resumo-gestao', 'actor']);
});
