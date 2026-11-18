// CT-15 a CT-20 e CT-25 do PRD, no handler carregado do gerado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mundo, A, B, INATIVO, hojeSP } from './_camada.mjs';

const patch = (w, c, body, user) => w.chamar('PATCH', '/cartoes/:id', { params: { id: c.id }, body: { versao: c.versao, ...body }, user });
const eventos = async (w, id) => (await w.chamar('GET', '/cartoes/:id/eventos', { params: { id } })).body.itens;
const lista = async (w, query = {}) => (await w.chamar('GET', '/cartoes', { query })).body;

test('CT-15: criar, mover, editar e recarregar preserva dados e histórico', async () => {
  const w = mundo();
  const r = await w.chamar('POST', '/cartoes', { body: { chave_criacao: 'chave-ct15-0001', titulo: '  Definir fornecedor  ', descricao: 'linha 1\nlinha 2', origem_tipo: 'reuniao', origem_texto: 'Reunião de segunda' } });
  assert.equal(r.status, 201);
  const c = r.body.cartao;
  assert.equal(c.titulo, 'Definir fornecedor', 'título sem espaços nas pontas');
  assert.equal(c.status, 'para_decidir', 'status inicial');
  assert.equal(c.versao, 1);
  assert.equal(c.criado_por, A);
  assert.equal(r.body.historico_incompleto, undefined);

  const m = await patch(w, c, { status: 'em_andamento' });
  assert.equal(m.status, 200);
  assert.equal(m.body.cartao.status, 'em_andamento');
  assert.equal(m.body.cartao.versao, 2);

  const e = await patch(w, m.body.cartao, { titulo: 'Definir fornecedor X', responsavel_id: B, prazo: '2030-01-31' }, { id: B, roles: [] });
  assert.equal(e.status, 200);
  assert.equal(e.body.cartao.versao, 3);
  assert.equal(e.body.cartao.alterado_por, B);

  const recarregado = (await lista(w)).itens.find((x) => x.id === c.id);
  assert.equal(recarregado.titulo, 'Definir fornecedor X');
  assert.equal(recarregado.responsavel_id, B);
  assert.equal(recarregado.prazo, '2030-01-31');
  assert.equal(recarregado.descricao, 'linha 1\nlinha 2');
  assert.equal(recarregado.origem_tipo, 'reuniao');

  const h = await eventos(w, c.id);
  assert.deepEqual(h.map((x) => x.tipo), ['criado', 'status', 'edicao']);
  assert.deepEqual(h[1].antes, { status: 'para_decidir' });
  assert.deepEqual(h[1].depois, { status: 'em_andamento' });
  assert.deepEqual(h[2].antes, { titulo: 'Definir fornecedor', responsavel_id: null, prazo: null });
  assert.equal(h[2].autor_id, B);
});

test('CT-16: título vazio ou só espaços é recusado e nada é gravado', async () => {
  for (const titulo of ['', '   ', undefined, null]) {
    const w = mundo();
    const r = await w.chamar('POST', '/cartoes', { body: { chave_criacao: 'chave-ct16-0001', titulo } });
    assert.equal(r.status, 400, JSON.stringify(titulo));
    assert.equal(r.body.campo, 'titulo');
    assert.equal(w.gravacoes(), 0);
  }
});

test('CT-16: editar título para espaços é recusado', async () => {
  const w = mundo();
  const c = await w.criar();
  const r = await patch(w, c, { titulo: '   ' });
  assert.equal(r.status, 400);
  assert.equal(w.models.Cartao.chamadas.update.length, 0);
});

test('CT-16: prazo ausente continua ausente; sem responsável não vincula ninguém', async () => {
  const w = mundo();
  const c = await w.criar();
  assert.equal(c.prazo, null);
  assert.equal(c.responsavel_id, null);
  const r = await patch(w, c, { titulo: 'Outro' });
  assert.equal(r.body.cartao.prazo, null);
  assert.equal(r.body.cartao.responsavel_id, null);
});

test('CT-16: responsável inativo ou desconhecido é recusado; vazio limpa', async () => {
  const w = mundo();
  for (const responsavel_id of [INATIVO, 'usr-nao-existe', 42]) {
    const r = await w.chamar('POST', '/cartoes', { body: { chave_criacao: 'chave-resp-0001', titulo: 'T', responsavel_id } });
    assert.equal(r.status, 400, String(responsavel_id));
    assert.equal(r.body.campo, 'responsavel_id');
  }
  assert.equal(w.models.Cartao.chamadas.create.length, 0);
  const c = await w.criar({ responsavel_id: B });
  assert.equal(c.responsavel_id, B);
  const r = await patch(w, c, { responsavel_id: '' });
  assert.equal(r.body.cartao.responsavel_id, null);
});

test('CT-17: prazo ontem é vencido; hoje não; concluído ou arquivado não', async () => {
  const w = mundo();
  const ontem = await w.criar({ titulo: 'Ontem', prazo: hojeSP(-1) });
  const hoje = await w.criar({ titulo: 'Hoje', prazo: hojeSP(0) });
  const semPrazo = await w.criar({ titulo: 'Sem prazo' });
  const concluido = await w.criar({ titulo: 'Concluído', prazo: hojeSP(-3), status: 'concluido' });
  const arquivado = await w.criar({ titulo: 'Arquivado', prazo: hojeSP(-3) });
  await w.chamar('POST', '/cartoes/:id/arquivar', { params: { id: arquivado.id } });

  assert.equal(ontem.vencido, true);
  assert.equal(hoje.vencido, false);
  assert.equal(semPrazo.vencido, false);
  assert.equal(concluido.vencido, false);

  const v = await lista(w, { vencidos: '1' });
  assert.deepEqual(v.itens.map((x) => x.titulo), ['Ontem']);
  const arq = await lista(w, { arquivados: '1', vencidos: '1' });
  assert.equal(arq.itens.length, 0, 'arquivado não entra em vencidos');
});

test('CT-18: concluir grava concluido_em; reabrir apaga e o histórico guarda os dois', async () => {
  const w = mundo();
  const c = await w.criar();
  const fim = await patch(w, c, { status: 'concluido' });
  assert.equal(fim.status, 200);
  assert.ok(fim.body.cartao.concluido_em, 'concluido_em preenchido');
  const reaberto = await patch(w, fim.body.cartao, { status: 'aguardando' });
  assert.equal(reaberto.body.cartao.concluido_em, null);
  const h = await eventos(w, c.id);
  assert.deepEqual(h.map((x) => x.tipo), ['criado', 'status', 'status']);
  assert.equal(h[1].depois.concluido_em, fim.body.cartao.concluido_em);
  assert.equal(h[2].antes.concluido_em, fim.body.cartao.concluido_em);
  assert.equal(h[2].depois.concluido_em, null);
});

test('CT-18: arquivar tira do quadro padrão e preserva; restaurar devolve', async () => {
  const w = mundo();
  const c = await w.criar({ titulo: 'Arquivar-me', status: 'aguardando' });
  await w.criar({ titulo: 'Fica' });
  const a = await w.chamar('POST', '/cartoes/:id/arquivar', { params: { id: c.id } });
  assert.equal(a.status, 200);
  assert.equal(a.body.cartao.arquivado, true);
  assert.ok(a.body.cartao.arquivado_em);
  assert.deepEqual((await lista(w)).itens.map((x) => x.titulo), ['Fica']);
  assert.deepEqual((await lista(w, { arquivados: '1' })).itens.map((x) => x.titulo), ['Arquivar-me']);

  const ed = await patch(w, a.body.cartao, { titulo: 'Não pode' });
  assert.equal(ed.status, 409);
  assert.equal(ed.body.erro, 'arquivado');

  const deNovo = await w.chamar('POST', '/cartoes/:id/arquivar', { params: { id: c.id } });
  assert.equal(deNovo.status, 200);
  assert.equal(deNovo.body.cartao.versao, a.body.cartao.versao, 'arquivar de novo não muda nada');

  const r = await w.chamar('POST', '/cartoes/:id/restaurar', { params: { id: c.id } });
  assert.equal(r.status, 200);
  assert.equal(r.body.cartao.arquivado, false);
  assert.equal(r.body.cartao.arquivado_em, null);
  assert.equal(r.body.cartao.status, 'aguardando', 'volta com o status que tinha');
  assert.equal((await lista(w)).itens.length, 2);
  assert.deepEqual((await eventos(w, c.id)).map((x) => x.tipo), ['criado', 'arquivado', 'restaurado']);
  assert.equal(w.models.Cartao.chamadas.delete.length, 0, 'nada é apagado');
});

test('CT-19: duas sessões editando o mesmo cartão — a segunda recebe 409 e nada é sobrescrito', async () => {
  const w = mundo();
  const c = await w.criar({ titulo: 'Original' });
  const sessaoA = { ...c };
  const sessaoB = { ...c };
  const r1 = await patch(w, sessaoA, { titulo: 'Versão de A' });
  assert.equal(r1.status, 200);
  const r2 = await patch(w, sessaoB, { titulo: 'Versão de B' }, { id: B, roles: [] });
  assert.equal(r2.status, 409);
  assert.equal(r2.body.erro, 'conflito');
  assert.equal(r2.body.atual.titulo, 'Versão de A', 'devolve o atual para recarregar');
  assert.equal(r2.body.atual.versao, 2);
  assert.equal(w.models.Cartao.chamadas.update.length, 1, 'só a primeira gravou');
  assert.equal((await lista(w)).itens[0].titulo, 'Versão de A');
});

test('CT-19: versao ausente ou não inteira é recusada', async () => {
  const w = mundo();
  const c = await w.criar();
  for (const versao of [undefined, '1', 1.5, 0]) {
    const r = await w.chamar('PATCH', '/cartoes/:id', { params: { id: c.id }, body: { versao, titulo: 'X' } });
    assert.equal(r.status, 400, String(versao));
  }
  assert.equal(w.models.Cartao.chamadas.update.length, 0);
});

test('CT-20: repetir a criação com a mesma chave não duplica', async () => {
  const w = mundo();
  const body = { chave_criacao: 'chave-ct20-0001', titulo: 'Uma vez só' };
  const r1 = await w.chamar('POST', '/cartoes', { body });
  const r2 = await w.chamar('POST', '/cartoes', { body });
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 200);
  assert.equal(r2.body.repetido, true);
  assert.equal(r2.body.cartao.id, r1.body.cartao.id);
  assert.equal(w.models.Cartao.linhas.length, 1);
  assert.equal(w.models.CartaoEvento.linhas.length, 1, 'um evento de criação só');
  const outra = await w.chamar('POST', '/cartoes', { body: { ...body, chave_criacao: 'chave-ct20-0002' } });
  assert.equal(outra.status, 201, 'contraste: chave nova cria');
  assert.equal(w.models.Cartao.linhas.length, 2);
});

test('CT-20: chave_criacao ausente ou inválida é recusada', async () => {
  const w = mundo();
  for (const chave_criacao of [undefined, '', 'curta', 'tem espaço aqui', { a: 1 }]) {
    const r = await w.chamar('POST', '/cartoes', { body: { chave_criacao, titulo: 'T' } });
    assert.equal(r.status, 400, JSON.stringify(chave_criacao));
  }
  assert.equal(w.gravacoes(), 0);
});

test('CT-25: conteúdo malicioso fica como dado', async () => {
  const w = mundo();
  const c = await w.criar({ titulo: '<script>alert(1)</script>', descricao: '<img src=x onerror=alert(1)>' });
  assert.equal(c.titulo, '<script>alert(1)</script>');
  assert.equal(c.descricao, '<img src=x onerror=alert(1)>');
});

test('CT-25: referência só https://', async () => {
  const w = mundo();
  for (const referencia_url of ['javascript:alert(1)', 'http://exemplo.test/x', 'data:text/html,oi', 'https://', 'https://exemplo.test/a b', ' JAVASCRIPT:alert(1)', 'ftp://exemplo.test']) {
    const r = await w.chamar('POST', '/cartoes', { body: { chave_criacao: 'chave-url-00001', titulo: 'T', referencia_url } });
    assert.equal(r.status, 400, referencia_url);
    assert.equal(r.body.campo, 'referencia_url');
  }
  assert.equal(w.gravacoes(), 0);
  const ok = await w.criar({ referencia_url: 'https://suporte.exemplo.test/tickets/123' });
  assert.equal(ok.referencia_url, 'https://suporte.exemplo.test/tickets/123');
});

test('CT-25: texto que não é string, caractere de controle e excesso são recusados', async () => {
  const w = mundo();
  const casos = [
    { titulo: { a: 1 } },
    { titulo: ['x'] },
    { titulo: 'linha\u0000nula' },
    { titulo: 'quebra\nde linha' },
    { titulo: 'x'.repeat(201) },
    { titulo: 'T', descricao: 'd'.repeat(5001) },
    { titulo: 'T', descricao: 123 },
    { titulo: 'T', status: 'excluido' },
    { titulo: 'T', origem_tipo: 'telefone' },
    { titulo: 'T', prazo: '2026-02-30' },
    { titulo: 'T', prazo: '18/11/2026' },
  ];
  for (const c of casos) {
    const r = await w.chamar('POST', '/cartoes', { body: { chave_criacao: 'chave-ct25-0001', ...c } });
    assert.equal(r.status, 400, JSON.stringify(c).slice(0, 60));
  }
  assert.equal(w.gravacoes(), 0);
  const limite = await w.criar({ titulo: 'x'.repeat(200), descricao: 'a\u0000b\u0007c\r\nd' });
  assert.equal(limite.titulo.length, 200, 'contraste: 200 passa');
  assert.equal(limite.descricao, 'abc\nd', 'descrição perde controle e mantém quebra de linha');
});

test('PATCH: campo desconhecido no corpo não é gravado', async () => {
  const w = mundo();
  const c = await w.criar();
  const r = await patch(w, c, { titulo: 'Novo', criado_por: 'usr-x', arquivado: true, versao_extra: 9, id: 'outro' });
  assert.equal(r.status, 200);
  const gravado = w.models.Cartao.chamadas.update[0].data;
  assert.deepEqual(Object.keys(gravado).sort(), ['alterado_em', 'alterado_por', 'titulo', 'versao']);
});

test('PATCH sem mudança não grava nem aumenta a versão', async () => {
  const w = mundo();
  const c = await w.criar({ titulo: 'Igual' });
  const r = await patch(w, c, { titulo: 'Igual' });
  assert.equal(r.status, 200);
  assert.equal(r.body.cartao.versao, 1);
  assert.equal(w.models.Cartao.chamadas.update.length, 0);
});

test('cartão inexistente → 404 em PATCH, arquivar, restaurar e eventos', async () => {
  const w = mundo();
  const p = { params: { id: 'nao-existe' } };
  assert.equal((await w.chamar('PATCH', '/cartoes/:id', { ...p, body: { versao: 1, titulo: 'x' } })).status, 404);
  assert.equal((await w.chamar('POST', '/cartoes/:id/arquivar', p)).status, 404);
  assert.equal((await w.chamar('POST', '/cartoes/:id/restaurar', p)).status, 404);
  assert.equal((await w.chamar('GET', '/cartoes/:id/eventos', p)).status, 404);
  assert.equal(w.gravacoes(), 0);
});

test('evento falhou → cartão salvo e historico_incompleto: true', async () => {
  const w = mundo();
  w.models.CartaoEvento.falhar.create = true;
  const r = await w.chamar('POST', '/cartoes', { body: { chave_criacao: 'chave-evt-00001', titulo: 'T' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.historico_incompleto, true);
  assert.equal(w.models.Cartao.linhas.length, 1);
  const m = await patch(w, r.body.cartao, { status: 'aguardando' });
  assert.equal(m.body.historico_incompleto, true);
  w.models.CartaoEvento.falhar.create = false;
  const ok = await patch(w, m.body.cartao, { status: 'em_andamento' });
  assert.equal(ok.body.historico_incompleto, undefined, 'contraste');
});
