// <config/>
/**
 * CRUD com guarda (desenho 2026-11-25-desenho-horas-rotas-genericas).
 * O mesmo texto serve todas as rotas de CRUD do app; o sync troca a linha
 * "<config/>" por `var MODELO = '...'; var POLITICA = '...';`.
 *   GET sem id → lista · GET com id → um · POST → cria · PUT/PATCH → altera · DELETE → apaga
 * Políticas:
 *   'fora'        → 405 em tudo
 *   'admin'       → ler e gravar só admin
 *   'admin-grava' → ler: quem está logado · gravar: só admin
 *   'pessoal'     → ler: quem está logado (filtro por dono na fatia B) · criar grava
 *                   user_id = quem pede · alterar e apagar só o próprio registro
 *   'csv'         → ler: quem está logado (fatia B) · criar grava o autor = quem pede ·
 *                   alterar e apagar só admin
 * Toda chamada exige pessoa (sessão); chave sem pessoa recebe 401.
 */
async function handler(ctx) {
  var model = ctx.models[MODELO];
  if (!model) return ctx.reply.status(500).send({ error: 'Model ' + MODELO + ' missing' });

  var method = String(ctx.method || 'GET').toUpperCase();
  var id = ctx.params && ctx.params.id != null ? String(ctx.params.id) : '';
  var op =
    method === 'GET' ? (id ? 'um' : 'lista') : method === 'POST' ? 'cria' : method === 'DELETE' ? 'apaga' : 'altera';
  var grava = op === 'cria' || op === 'altera' || op === 'apaga';

  if (POLITICA === 'fora') {
    return ctx.reply.status(405).send({ error: 'metodo_nao_permitido' });
  }

  var requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required' });
  }
  var quem = String(requester.id);

  async function souAdmin() {
    var roles = requester.roles || [];
    if (roles.indexOf('admin') >= 0) return true;
    var Profile = ctx.models.StaffProfile;
    var p = Profile ? await Profile.findById(quem) : null;
    var papel = String((p && p.role) || '');
    return papel === 'admin' || papel === 'master';
  }
  function semPermissao() {
    return ctx.reply.status(403).send({ error: 'sem_permissao' });
  }

  var precisaAdmin =
    POLITICA === 'admin' ||
    (POLITICA === 'admin-grava' && grava) ||
    (POLITICA === 'csv' && (op === 'altera' || op === 'apaga'));
  if (precisaAdmin && !(await souAdmin())) return semPermissao();

  var corpo = Object.assign({}, ctx.body || {});

  if (op === 'lista') {
    var rows = await model.findMany(ctx.query || {});
    return ctx.reply.send({ data: rows, count: rows.length });
  }
  if (op === 'um') {
    var row = await model.findById(id);
    if (!row) return ctx.reply.status(404).send({ error: 'not found' });
    return ctx.reply.send({ data: row });
  }

  if (POLITICA === 'pessoal') {
    // O dono é sempre quem pede; o user_id do corpo é ignorado.
    delete corpo.user_id;
    delete corpo.userId;
    if (op === 'cria') {
      corpo.user_id = quem;
    } else {
      var atual = await model.findById(id);
      if (!atual) return ctx.reply.status(404).send({ error: 'not found' });
      var dono = String(atual.user_id || atual.userId || '');
      if (dono !== quem) return semPermissao();
    }
  }
  if (POLITICA === 'csv' && op === 'cria') {
    // O autor é sempre quem pede.
    delete corpo.generatedById;
    delete corpo.generatedByName;
    delete corpo.user_id;
    delete corpo.userId;
    corpo.generated_by_id = quem;
    var PerfilCsv = ctx.models.StaffProfile;
    var pc = PerfilCsv ? await PerfilCsv.findById(quem) : null;
    corpo.generated_by_name =
      (pc && (pc.full_name || pc.fullName || pc.name)) || requester.name || requester.email || '';
  }

  if (op === 'cria') {
    var criado = await model.create(corpo);
    return ctx.reply.status(201).send({ data: criado });
  }
  if (op === 'altera') {
    try {
      var alterado = await model.update(id, corpo);
      return ctx.reply.send({ data: alterado });
    } catch (e) {
      return ctx.reply.status(404).send({ error: String(e.message || e) });
    }
  }
  try {
    await model.delete(id);
    return ctx.reply.send({ ok: true });
  } catch (e2) {
    return ctx.reply.status(404).send({ error: String(e2.message || e2) });
  }
}
module.exports = { handler };
