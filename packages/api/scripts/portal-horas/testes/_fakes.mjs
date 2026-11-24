// Fakes da camada de models para os testes do fechamento de mês. Reproduz
// packages/api/src/lib/models.ts: findMany com igualdade por campo, mais
// recentes primeiro, no máximo 500 por chamada e offset; findById pelo id do
// registro ou pelo data.id; update por merge; registra cada gravação.

export function tabela(linhas = [], { falharLeitura = false, aoLer = null } = {}) {
  let seq = 0;
  const rows = linhas.map((r) => ({ ...r, _criado: ++seq }));
  const gravacoes = [];
  const leituras = [];
  const achar = (id) => rows.find((r) => String(r.id) === String(id)) || null;
  const api = {
    rows,
    gravacoes,
    leituras,
    async findMany(filtro = {}) {
      if (falharLeitura) throw new Error('falha de leitura simulada');
      leituras.push({ ...filtro });
      if (aoLer) aoLer(leituras.length, api);
      const meta = new Set(['limit', 'offset']);
      const campos = Object.entries(filtro).filter(([k]) => !meta.has(k));
      const take = Math.min(500, Math.max(1, Number(filtro.limit) || 500));
      const skip = Math.max(0, Number(filtro.offset) || 0);
      return rows
        .filter((r) => campos.every(([k, v]) => r[k] === v))
        .slice()
        .sort((a, b) => b._criado - a._criado)
        .slice(skip, skip + take)
        .map((r) => ({ ...r }));
    },
    async findById(id) {
      if (falharLeitura) throw new Error('falha de leitura simulada');
      const r = achar(id);
      return r ? { ...r } : null;
    },
    async create(data) {
      const r = { id: data.id || 'gen' + (seq + 1), ...data, _criado: ++seq };
      if (api.semRegistrar) {
        rows.push(r);
        return { ...r };
      }
      rows.push(r);
      gravacoes.push({ op: 'create', id: r.id });
      return { ...r };
    },
    async update(id, data) {
      const r = achar(id);
      if (!r) throw new Error('not found: ' + id);
      Object.assign(r, data);
      gravacoes.push({ op: 'update', id: r.id });
      return { ...r };
    },
    async delete(id) {
      const i = rows.findIndex((r) => String(r.id) === String(id));
      if (i < 0) throw new Error('not found: ' + id);
      rows.splice(i, 1);
      gravacoes.push({ op: 'delete', id });
      return true;
    },
  };
  return api;
}

export const PERFIS = [
  { id: 'adm', role: 'admin', email: 'adm@x', full_name: 'Admin Teste' },
  { id: 'ger', role: 'user', manager_role: true, email: 'ger@x', full_name: 'Gestor Teste' },
  { id: 'u', role: 'user', email: 'u@x', full_name: 'Pessoa Teste' },
];

export function lanc(id, date, extra = {}) {
  return {
    id,
    user_id: 'u',
    date,
    start_time: '09:00',
    end_time: '10:00',
    duration_minutes: 60,
    hour_type: 'NORMAL',
    status: 'PENDING',
    ...extra,
  };
}

/** ctx do handler. `models` recebe as tabelas; outros models viram tabela vazia. */
export function contexto({ method = 'GET', params = {}, body = {}, query = {}, user = 'adm', models = {}, ausentes = [] }) {
  let status = 200;
  const extras = {};
  const todos = new Proxy(models, {
    get(alvo, nome) {
      if (nome in alvo) return alvo[nome];
      if (typeof nome !== 'string' || ausentes.includes(nome)) return undefined;
      if (!extras[nome]) extras[nome] = tabela([]);
      return extras[nome];
    },
    has(alvo, nome) {
      return nome in alvo || (typeof nome === 'string' && !ausentes.includes(nome));
    },
  });
  return {
    method,
    params,
    body,
    query,
    user: user ? { id: user, roles: user === 'adm' ? ['admin'] : [] } : null,
    models: todos,
    reply: {
      status(c) {
        status = c;
        return this;
      },
      send(b) {
        return { status, body: b };
      },
    },
  };
}
