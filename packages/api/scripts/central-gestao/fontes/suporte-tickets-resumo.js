/**
 * GET /tickets/resumo-gestao?mes=AAAA-MM — contagens para a Central de Gestão, sem devolver tickets.
 * Universo: quadro suporte (campo `quadro` ausente ou "suporte"), sem arquivados (`is_archived === true` fora).
 *   - ativos: status em novos_chamados, triagem, em_atendimento, em_teste, aguardando_cliente,
 *     pendencia_suporte, pendencia_dev;
 *   - sem_responsavel: ativos sem `assigned_to`/`assignedTo`;
 *   - criados_no_mes: `created_at` (data local de São Paulo) dentro do mês, qualquer status.
 * Lê TODOS os tickets de 500 em 500 (limit/offset). Se não terminar a leitura, `complete: false`, sem números.
 * Mesmo nível mínimo de GET /tickets (user), pela guarda de sessão do portal.
 */
async function handler(ctx) {
  var T = ctx.models && ctx.models.Ticket;
  if (!T) return ctx.reply.status(503).send({ success: false, error: "Model Ticket missing" });
  var q = ctx.query || {};
  var mes = q.mes;
  if (typeof mes !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return ctx.reply.status(400).send({ success: false, error: "mes deve ser AAAA-MM" });
  }
  var ATIVOS = ["novos_chamados", "triagem", "em_atendimento", "em_teste", "aguardando_cliente", "pendencia_suporte", "pendencia_dev"];
  function diaSP(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    var o = {};
    for (var i = 0; i < p.length; i++) o[p[i].type] = p[i].value;
    return o.year + "-" + o.month + "-" + o.day;
  }
  var LOTE = 500;
  var TETO = 40;
  var vistos = {};
  var itens = [];
  var completo = false;
  for (var l = 0; l < TETO; l++) {
    var linhas = (await T.findMany({ limit: LOTE, offset: l * LOTE })) || [];
    for (var j = 0; j < linhas.length; j++) {
      var id = String(linhas[j].id);
      if (!vistos[id]) { vistos[id] = true; itens.push(linhas[j]); }
    }
    if (linhas.length < LOTE) { completo = true; break; }
  }
  if (!completo) return ctx.reply.send({ mes: mes, complete: false });
  var ativos = 0, semResp = 0, criados = 0;
  for (var k = 0; k < itens.length; k++) {
    var t = itens[k];
    if (String(t.quadro || "suporte") !== "suporte") continue;
    if (t.is_archived === true) continue;
    if (ATIVOS.indexOf(String(t.status || "")) >= 0) {
      ativos += 1;
      if (!(t.assigned_to || t.assignedTo)) semResp += 1;
    }
    var c = t.created_at || t.createdAt;
    if (c && diaSP(c).slice(0, 7) === mes) criados += 1;
  }
  return ctx.reply.send({ mes: mes, complete: true, ativos: ativos, sem_responsavel: semResp, criados_no_mes: criados });
}

// ── Guarda de sessão (scripts/guarda-sessao.py) ──
// Nada responde sem pessoa identificada. A identidade vem do JWT (`ctx.user`)
// ou da sessão do portal (`x-portal-sessao`); sem nenhuma das duas, 401.
// Chave de API de app não carrega pessoa, então não identifica ninguém.
// Membro desativado (`active: false` no Profile) recebe 403 em toda rota.
async function _gsSessao(ctx) {
  try {
    var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || "";
    var partes = String(h).split(".");
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    var S = ctx.models && ctx.models.Sessao;
    if (!S) return null;
    var linha = await S.findById("ses_" + partes[0]);
    if (!linha || linha.revogada === true) return null;
    if (String(linha.verificador || "") !== partes[1]) return null;
    if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;
    return linha.user_id || null;
  } catch (e) { return null; }
}
var _gsRANK = { user: 10, support: 20, developer: 30, admin: 40 };
var _gsAPELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
function _gsCanonico(cru) {
  var v = String(cru || "").trim().toLowerCase();
  return _gsRANK[v] !== undefined ? v : (_gsAPELIDOS[v] || "");
}
async function _gsEuSou(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || (await _gsSessao(ctx));
  if (!quem) return null;
  var p = null;
  if (ctx.models && ctx.models.Profile) {
    p = await ctx.models.Profile.findById(quem).catch(function () { return null; });
  }
  return {
    id: quem,
    nivel: _gsRANK[_gsCanonico(p ? p.role : "")] || 0,
    // Só `false` literal desativa: cadastro sem o campo é de antes dele existir.
    desativado: !!(p && p.active === false),
  };
}
var _gsOriginal = handler;
async function _gsComSessao(ctx) {
  var eu = await _gsEuSou(ctx);
  if (!eu) {
    return ctx.reply.status(401).send({ success: false, error: "Requer sessão do portal" });
  }
  if (eu.desativado) {
    return ctx.reply.status(403).send({ success: false, error: "Acesso desativado", desativado: true });
  }
  if (eu.nivel < _gsRANK["user"]) {
    return ctx.reply.status(403).send({ success: false, error: "Sem permissão para esta operação" });
  }
  return _gsOriginal(ctx);
}
module.exports = { handler: _gsComSessao };
