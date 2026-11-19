// Emulador de packages/api/src/lib/models.ts para os testes da Central.
// - findMany: metachaves iguais às da camada; o resto é igualdade EXATA (campo
//   ausente NÃO casa com "" nem com false, como no Postgres); teto 500;
//   limit/offset; ordem created DESC (aqui: ordem de inserção invertida).
// - findById: PK da linha, depois data.id.
// - create/update: validação no mesmo espírito do zodFromJsonSchema (models.json):
//   obrigatório tem de existir com o tipo; opcional aceita null/ausente.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { handler } from './_carregar.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.resolve(AQUI, '../models.json'), 'utf8')).map((m) => [m.name, m.schema]),
);
const META = new Set(['mascararCampos', 'limit', 'offset', 'page', 'pageSize', 'perPage', 'sort', 'order', 'orderBy', 'q', 'search', 'include', 'fields']);

function tipoOk(v, t) {
  if (t === 'string') return typeof v === 'string';
  if (t === 'integer' || t === 'number') return typeof v === 'number';
  if (t === 'boolean') return typeof v === 'boolean';
  if (t === 'object') return typeof v === 'object' && v !== null && !Array.isArray(v);
  if (t === 'array') return Array.isArray(v);
  return true;
}
function validar(nome, data) {
  const s = SCHEMAS[nome];
  const req = new Set(s.required || []);
  for (const [k, p] of Object.entries(s.properties)) {
    const v = data[k];
    if (req.has(k)) {
      if (!tipoOk(v, p.type)) throw new Error(`Validation failed for central-gestao-${nome}: ${k}`);
    } else if (v !== null && v !== undefined && !tipoOk(v, p.type)) {
      throw new Error(`Validation failed for central-gestao-${nome}: ${k}`);
    }
  }
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b) && a !== undefined;
const clone = (o) => JSON.parse(JSON.stringify(o));

let seq = 0;
export function criarModel(nome) {
  const linhas = [];
  const m = {
    nome,
    linhas,
    chamadas: { findMany: [], findById: [], create: [], update: [], delete: [] },
    falhar: {},
    async findMany(filtro = {}) {
      m.chamadas.findMany.push(clone(filtro));
      if (m.falhar.findMany) throw new Error('falha simulada');
      const take = Math.min(500, Math.max(1, Number(filtro.limit ?? filtro.pageSize ?? filtro.perPage) || 500));
      const offset = Math.max(0, Number(filtro.offset) || 0);
      const campos = Object.entries(filtro).filter(([k]) => !META.has(k));
      return linhas
        .filter((l) => campos.every(([k, v]) => igual(l.data[k], v)))
        .sort((a, b) => b.seq - a.seq)
        .slice(offset, offset + take)
        .map((l) => ({ ...clone(l.data), id: (typeof l.data.id === 'string' && l.data.id) || l.pk }));
    },
    async findById(id) {
      m.chamadas.findById.push(id);
      if (m.falhar.findById) throw new Error('falha simulada');
      const l = linhas.find((x) => x.pk === id) || linhas.find((x) => x.data.id === id);
      return l ? { ...clone(l.data), id: (typeof l.data.id === 'string' && l.data.id) || l.pk } : null;
    },
    async create(data) {
      m.chamadas.create.push(clone(data));
      if (m.falhar.create) throw new Error('falha simulada');
      validar(nome, data);
      const l = { pk: 'pk' + ++seq, seq, data: clone(data) };
      linhas.push(l);
      return { id: l.pk, ...clone(l.data) };
    },
    async update(id, data) {
      m.chamadas.update.push({ id, data: clone(data) });
      const l = linhas.find((x) => x.pk === id) || linhas.find((x) => x.data.id === id);
      if (!l) throw new Error(`not found: ${id}`);
      const merged = { ...l.data, ...clone(data) };
      validar(nome, merged);
      l.data = merged;
      return { ...clone(l.data), id: (typeof l.data.id === 'string' && l.data.id) || l.pk };
    },
    async delete(id) {
      m.chamadas.delete.push(id);
      throw new Error('a Central não apaga');
    },
    // Linha gravada direto, com PK escolhida (para casos que a API não produz sozinha).
    inserirCru(pk, data) {
      linhas.push({ pk, seq: ++seq, data: clone(data) });
    },
    gravacoes() {
      return m.chamadas.create.length + m.chamadas.update.length + m.chamadas.delete.length;
    },
  };
  return m;
}

export const A = 'usr-a-0001';
export const B = 'usr-b-0002';
export const INATIVO = 'usr-c-0003';
export const ESTRANHO = 'usr-x-0009';

// Um "mundo": os 3 models com dois membros ativos e um inativo.
export function mundo({ semModel = [] } = {}) {
  const models = { Profile: criarModel('Profile'), Cartao: criarModel('Cartao'), CartaoEvento: criarModel('CartaoEvento'), RegistroMarketing: criarModel('RegistroMarketing') };
  models.Profile.inserirCru('pkA', { id: A, name: 'Pessoa A', role: 'admin', active: true });
  models.Profile.inserirCru('pkB', { id: B, name: 'Pessoa B', role: 'membro', active: true });
  models.Profile.inserirCru('pkC', { id: INATIVO, name: 'Pessoa C', role: 'membro', active: false });
  for (const n of semModel) delete models[n];
  const w = {
    models,
    gravacoes: () => Object.values(models).reduce((s, m) => s + m.gravacoes(), 0),
    async chamar(method, rota, { user = { id: A, email: 'a@exemplo.test', roles: [] }, params = {}, query = {}, body } = {}) {
      const h = handler(method, rota);
      return h({ method, params, query, body, user, models, randomUUID: () => crypto.randomUUID() });
    },
    async criar(campos = {}, user) {
      const r = await w.chamar('POST', '/cartoes', { user, body: { chave_criacao: crypto.randomUUID(), titulo: 'Cartão', ...campos } });
      if (r.status !== 201) throw new Error('criar falhou: ' + JSON.stringify(r.body));
      return r.body.cartao;
    },
  };
  return w;
}

export function hojeSP(deslocDias = 0) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + deslocDias));
  return d.toISOString().slice(0, 10);
}
