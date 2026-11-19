// `ctx.fetch` falso que roda os handlers REAIS das fontes (Suporte e Horas pelo literal do arquivo
// gerado, CRM pelo .ts), cada um com a sua camada emulada e a checagem de membership da plataforma.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { todosHandlers, compilar, arqGerado, CRM_TS } from './_carregar.mjs';
import { criarModel } from './_camada.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(AQUI, '../../../src/apps');
function literal(arq, rota) {
  const gen = arqGerado(arq);
  const h = todosHandlers(fs.readFileSync(gen, 'utf8')).find((x) => x.method === 'GET' && x.path === rota);
  if (!h) throw new Error(`rota ${rota} não encontrada em ${arq}`);
  return compilar(h.code);
}
const crm = await import(CRM_TS);

// Model sem schema (as fontes não são deste app): aceita tudo, com a mesma leitura da camada.
function modelLivre(nome, linhas = []) {
  const m = criarModel('Profile');
  m.nome = nome;
  for (const [i, l] of linhas.entries()) m.inserirCru('pk-' + nome + i, l);
  return m;
}

export function fontes({ membros = {}, suporte = {}, crm: dCrm = {}, horas = {}, falhar = {} } = {}) {
  const chamadas = [];
  const suporteH = literal('portal-suporte', '/tickets/resumo-gestao');
  const horasH = literal('portal-horas', '/hour-entries/resumo');
  const mSup = { Ticket: modelLivre('Ticket', suporte.tickets || []), Profile: modelLivre('ProfileSup', suporte.perfis || []) };
  const mCrm = { Deal: modelLivre('Deal', dCrm.deals || []), Goal: modelLivre('Goal', dCrm.goals || []) };
  const mHor = { HourEntries: modelLivre('HourEntries', horas.lancamentos || []), StaffProfile: modelLivre('StaffProfile', horas.perfis || []) };
  async function fetch(url, init = {}) {
    chamadas.push({ url, init });
    const u = new URL(url);
    const m = u.pathname.match(/^\/v1\/r\/([^/]+)(\/.*)$/);
    const slug = m[1];
    const rota = m[2];
    if (falhar[slug] === 'throw') throw new Error('fetch: timeout simulado');
    if (falhar[slug] === 'allowlist') throw new Error('fetch: host not allowlisted: api.arara-tech.com');
    const truncado = falhar[slug] === 'truncated';
    const auth = (init.headers && init.headers.authorization) || '';
    const uid = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!uid) return { status: 401, headers: {}, body: JSON.stringify({ error: 'Unauthorized' }) };
    if (!(membros[slug] || []).includes(uid)) return { status: 403, headers: {}, body: JSON.stringify({ error: 'API key or user cannot access this app' }) };
    const ctx = { method: 'GET', params: {}, query: Object.fromEntries(u.searchParams), headers: {}, user: { id: uid, email: 'x@exemplo.test', roles: [] } };
    let res;
    if (slug === 'portal-suporte' && rota === '/tickets/resumo-gestao') res = await suporteH({ ...ctx, models: mSup });
    else if (slug === 'portal-horas' && rota === '/hour-entries/resumo') res = await horasH({ ...ctx, models: mHor });
    else if (slug === 'portal-crm' && rota === '/vendas/resumo-gestao') {
      let st = 200, sent;
      const reply = { status(c) { st = c; return this; }, send(v) { sent = v; return { status: st, body: v }; } };
      await crm.resumoDeVendas({ ...ctx, models: mCrm, reply });
      res = { status: st, body: sent };
    } else return { status: 404, headers: {}, body: JSON.stringify({ error: 'No static route matched' }) };
    // Truncado: corpo íntegro mas marcado pelo fetch — o número não pode ser usado mesmo assim.
    return { status: res.status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(res.body), ...(truncado ? { truncated: true } : {}) };
  }
  return { fetch, chamadas, modelos: { suporte: mSup, crm: mCrm, horas: mHor } };
}
