// Central de Gestão — auxiliares copiados em TODO handler pelo gerar-rotas.mjs.
// Mudou aqui, rode `node scripts/central-gestao/gerar-rotas.mjs` e os testes.
//
// Regras desta camada (packages/api/src/lib/models.ts):
// - findMany: filtro por igualdade exata, teto de 500 por chamada, `limit`/`offset`,
//   ordem só por created_at DESC.
// - Não há transação, unicidade nem gravação condicional. Conflito e duplicação
//   são tratados à mão, com a janela residual descrita no desenho.

var STATUS = ['para_decidir', 'em_andamento', 'aguardando', 'concluido'];
var ORIGENS = ['reuniao', 'area', 'outro'];
var LIMITE = { titulo: 200, descricao: 5000, decisao: 5000, origem_texto: 200, referencia_url: 2000, q: 200 };
var PAGINA = 200;
var LOTE = 500;
var TETO_LOTES = 20;

function _erro(ctx, status, codigo, mensagem, extra) {
  var corpo = { erro: codigo, mensagem: mensagem };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) corpo[k] = extra[k];
    }
  }
  return ctx.reply.status(status).send(corpo);
}

// Guarda de sessão: toda rota começa por aqui.
// sem pessoa (chave de app) → 401; leitura do Profile falhou → 503;
// sem Profile ativo da Central → 403. Papel de outro app não conta.
async function _guarda(ctx) {
  var u = ctx.user;
  if (!u || typeof u.id !== 'string' || !u.id) {
    return { resposta: _erro(ctx, 401, 'sem_sessao', 'Entre pelo Hub para usar a Central de Gestão.') };
  }
  var Profile = ctx.models && ctx.models.Profile;
  if (!Profile) {
    return { resposta: _erro(ctx, 503, 'nao_configurado', 'A Central de Gestão ainda não foi configurada.') };
  }
  var p;
  try {
    p = await Profile.findById(u.id);
  } catch (e) {
    return { resposta: _erro(ctx, 503, 'perfil_indisponivel', 'Não foi possível conferir seu acesso. Tente de novo.') };
  }
  if (!p || p.active !== true || String(p.id) !== u.id) {
    return { resposta: _erro(ctx, 403, 'sem_acesso', 'Você não tem acesso à Central de Gestão.') };
  }
  return {
    pessoa: {
      id: u.id,
      name: typeof p.name === 'string' ? p.name : '',
      role: p.role === 'admin' ? 'admin' : 'membro',
    },
  };
}

function _agora() {
  return new Date().toISOString();
}

// Data local (fuso da operação) de um instante, AAAA-MM-DD.
function _dataSP(instante) {
  var partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  var d = {};
  for (var i = 0; i < partes.length; i++) d[partes[i].type] = partes[i].value;
  return d.year + '-' + d.month + '-' + d.day;
}

// Data de hoje no fuso da operação, AAAA-MM-DD.
function _hojeSP() {
  return _dataSP(new Date());
}

function _corpo(ctx) {
  var b = ctx.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
}

// Texto vindo do corpo. Devolve { valor } (undefined = não veio; null = vazio) ou { erro }.
// Linha única recusa caractere de controle; multilinha tira os de controle e mantém \n e \t.
function _texto(v, campo, max, multilinha) {
  if (v === undefined) return { valor: undefined };
  if (v === null) return { valor: null };
  if (typeof v !== 'string') return { erro: campo + ' deve ser texto.' };
  var s = v.replace(/\r\n?/g, '\n');
  if (multilinha) {
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  } else if (/[\u0000-\u001F\u007F]/.test(s)) {
    return { erro: campo + ' tem caractere inválido.' };
  }
  s = s.trim();
  if (s.length > max) return { erro: campo + ' passa de ' + max + ' caracteres.' };
  return { valor: s === '' ? null : s };
}

function _prazo(v) {
  if (v === undefined) return { valor: undefined };
  if (v === null || v === '') return { valor: null };
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { erro: 'Prazo deve ser AAAA-MM-DD.' };
  var a = Number(v.slice(0, 4));
  var m = Number(v.slice(5, 7));
  var d = Number(v.slice(8, 10));
  var dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { erro: 'Prazo não é uma data válida.' };
  }
  return { valor: v };
}

function _url(v) {
  var t = _texto(v, 'Referência', LIMITE.referencia_url, false);
  if (t.erro || t.valor == null) return t;
  if (/\s/.test(t.valor)) return { erro: 'Referência não pode ter espaço.' };
  var u;
  try {
    u = new URL(t.valor);
  } catch (e) {
    return { erro: 'Referência não é um endereço válido.' };
  }
  if (u.protocol !== 'https:' || !u.hostname) return { erro: 'Referência deve ser um endereço https://.' };
  if (u.username || u.password) return { erro: 'Referência não pode ter usuário ou senha no endereço.' };
  if (u.href.length > LIMITE.referencia_url) return { erro: 'Referência passa de ' + LIMITE.referencia_url + ' caracteres.' };
  return { valor: u.href };
}

function _opcao(v, lista, campo) {
  if (v === undefined) return { valor: undefined };
  if (v === null || v === '') return { valor: null };
  if (typeof v !== 'string' || lista.indexOf(v) < 0) return { erro: campo + ' inválido.' };
  return { valor: v };
}

// Responsável: vazio, ou um Profile ativo da Central.
async function _responsavel(ctx, v) {
  if (v === undefined) return { valor: undefined };
  if (v === null || v === '') return { valor: null };
  if (typeof v !== 'string' || v.length > 100) return { erro: 'Responsável inválido.' };
  var p = await ctx.models.Profile.findById(v);
  if (!p || p.active !== true || String(p.id) !== v) return { erro: 'Responsável não é membro ativo da Central.' };
  return { valor: v };
}

// Lê TODAS as linhas do filtro, de 500 em 500. `completo: false` se bater no teto de lotes.
async function _lerTodos(Model, filtro) {
  var vistos = {};
  var itens = [];
  for (var lote = 0; lote < TETO_LOTES; lote++) {
    var f = { limit: LOTE, offset: lote * LOTE };
    for (var k in filtro) {
      if (Object.prototype.hasOwnProperty.call(filtro, k)) f[k] = filtro[k];
    }
    var linhas = (await Model.findMany(f)) || [];
    for (var i = 0; i < linhas.length; i++) {
      var id = String(linhas[i].id);
      if (!vistos[id]) {
        vistos[id] = true;
        itens.push(linhas[i]);
      }
    }
    if (linhas.length < LOTE) return { itens: itens, completo: true };
  }
  return { itens: itens, completo: false };
}

function _vencido(c, hoje) {
  return !!c.prazo && c.prazo < hoje && c.status !== 'concluido' && c.arquivado !== true;
}

// O que a tela recebe, campo a campo.
function _publico(c, hoje) {
  return {
    id: c.id,
    titulo: c.titulo,
    descricao: c.descricao == null ? null : c.descricao,
    status: c.status,
    responsavel_id: c.responsavel_id == null ? null : c.responsavel_id,
    prazo: c.prazo == null ? null : c.prazo,
    origem_tipo: c.origem_tipo == null ? null : c.origem_tipo,
    origem_texto: c.origem_texto == null ? null : c.origem_texto,
    referencia_url: c.referencia_url == null ? null : c.referencia_url,
    decisao: c.decisao == null ? null : c.decisao,
    criado_por: c.criado_por,
    criado_em: c.criado_em,
    alterado_por: c.alterado_por,
    alterado_em: c.alterado_em,
    concluido_em: c.concluido_em == null ? null : c.concluido_em,
    arquivado: c.arquivado === true,
    arquivado_em: c.arquivado_em == null ? null : c.arquivado_em,
    versao: c.versao,
    vencido: _vencido(c, hoje),
  };
}

// Histórico: se falhar, o cartão continua salvo e a resposta avisa.
async function _evento(ctx, cartaoId, tipo, antes, depois, autorId, em) {
  try {
    var E = ctx.models.CartaoEvento;
    if (!E) return false;
    await E.create({
      id: ctx.randomUUID(),
      cartao_id: cartaoId,
      tipo: tipo,
      antes: antes,
      depois: depois,
      autor_id: autorId,
      em: em,
    });
    return true;
  } catch (e) {
    return false;
  }
}

function _idParam(ctx) {
  var id = ctx.params && ctx.params.id;
  return typeof id === 'string' && id.length > 0 && id.length <= 100 ? id : null;
}

async function _cartaoOuNada(ctx, id) {
  var c = await ctx.models.Cartao.findById(id);
  if (!c || String(c.id) !== id || typeof c.titulo !== 'string') return null;
  return c;
}
