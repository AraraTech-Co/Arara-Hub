#!/usr/bin/env python3
# =============================================================================
# Módulo de Projetos e Gantt — Entrega 1, passo 2: as regras do servidor.
#
# Módulo NOVO (`projetos`), de propósito: publicar promove o rascunho INTEIRO do
# módulo, então rotas novas num módulo novo não arrastam nada de `tickets` nem
# de `whatsapp` junto.
#
#   GET    /projetos                            leitura
#   POST   /projetos                            planejamento
#   GET    /projetos/:id                        leitura (fases, membros, cards)
#   PATCH  /projetos/:id                        planejamento (exige updated_at)
#   POST   /projetos/:id/fases                  planejamento
#   PATCH  /projetos/:id/fases/:fid             planejamento
#   DELETE /projetos/:id/fases/:fid             planejamento
#   POST   /projetos/:id/membros                planejamento
#   DELETE /projetos/:id/membros/:uid           planejamento
#   POST   /projetos/:id/cards                  developer+ (pendura card)
#   PATCH  /projetos/:id/cards/:tid             developer+ (datas do card)
#   DELETE /projetos/:id/cards/:tid             developer+ (solta card)
#
# TRAVAS QUE MORAM AQUI, e não na tela (tela é cortesia, servidor é trava):
#   - data de planejamento só no formato de CALENDÁRIO "AAAA-MM-DD";
#   - fim nunca antes do início;
#   - concorrência otimista: quem grava manda o `updated_at` que leu, e um 409
#     avisa em vez de sobrescrever calado — é o cenário garantido de um Gantt,
#     duas pessoas arrastando barra na mesma reunião;
#   - apagar fase NUNCA apaga card: os cards voltam para "sem fase";
#   - soltar card do projeto limpa a fase e apaga as dependências dele, senão
#     sobram setas apontando para fora.
#
#   python3 scripts/projetos-regras.py            # simula (grava /tmp/prj_*.js)
#   python3 scripts/projetos-regras.py --aplicar
# =============================================================================

import subprocess
import sys

# O bloco de identidade/permissão/datas mora num arquivo só — duas cópias da
# mesma guarda é como uma delas fica para trás numa correção.
from _projetos_comum import COMUM, MOD, req  # noqa: E402

MARCA = "scripts/projetos-regras.py"

# ── Bloco comum: identidade, permissão, datas, log, progresso ────────────────
# O resolvedor de sessão é cópia de scripts/sessao-portal.py. Sem ele, JWT
# vencido cai na chave de app — que não carrega pessoa — e a guarda inteira
# seria pulada.
# ── GET /projetos ────────────────────────────────────────────────────────────
LISTAR = ("""// %s — GET /projetos
// Uma consulta de cards POR PROJETO, de propósito: varrer a tabela inteira de
// chamados é exatamente o que foi retirado do quadro em 24/08. Projetos são
// dezenas, chamados são milhares.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var P = ctx.models.Projeto, T = ctx.models.Ticket;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeVer(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para ver projetos" });

  var q = ctx.query || {};
  var filtro = {};
  if (q.tipo) filtro.tipo = String(q.tipo);
  if (q.status) filtro.status = String(q.status);
  if (q.company_id) filtro.company_id = String(q.company_id);
  if (q.responsavel_id) filtro.responsavel_id = String(q.responsavel_id);
  var linhas = (await P.findMany(filtro)) || [];

  // Arquivado só aparece quando pedido — mesmo desenho do `descartado` no quadro.
  var verArquivados = String(q.arquivados || "") === "1";
  linhas = linhas.filter(function (p) { return verArquivados ? !!p.arquivado_em : !p.arquivado_em; });

  if (String(q.meus || "") === "1" && eu.id) {
    var M = ctx.models.ProjetoMembro;
    var meus = {};
    if (M) {
      var vinculos = (await M.findMany({ user_id: String(eu.id) })) || [];
      for (var v = 0; v < vinculos.length; v++) meus[String(vinculos[v].projeto_id)] = 1;
    }
    linhas = linhas.filter(function (p) {
      return meus[String(p.id)] === 1 || String(p.responsavel_id || "") === String(eu.id);
    });
  }

  var saida = [];
  for (var i = 0; i < linhas.length; i++) {
    var p = linhas[i];
    var cards = T ? ((await T.findMany({ projeto_id: String(p.id) })) || []) : [];
    var atrasados = 0;
    for (var c = 0; c < cards.length; c++) if (_atrasado(cards[c])) atrasados++;
    saida.push(Object.assign({}, p, {
      total_cards: cards.length,
      cards_atrasados: atrasados,
      progresso: _progressoDe(cards),
    }));
  }
  saida.sort(function (a, b) { return String(b.created_at || "").localeCompare(String(a.created_at || "")); });
  return ctx.reply.send({ success: true, data: saida });
}
module.exports = { handler };
"""

# ── POST /projetos ───────────────────────────────────────────────────────────
CRIAR = ("""// %s — POST /projetos
// O código (PRJ-001) sai de um CONTADOR com reserva atômica, não de "contar
// quantos existem": duas pessoas criando ao mesmo tempo gerariam dois PRJ-004.
""" % MARCA) + COMUM + """
async function alocarCodigo(P, Seq) {
  var todos = (await P.findMany({})) || [];
  var max = 0, usado = {};
  for (var i = 0; i < todos.length; i++) {
    var cod = String(todos[i].codigo || "");
    usado[cod] = 1;
    if (cod.indexOf("PRJ-") === 0) {
      var n = parseInt(cod.slice(4), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var proximo = max + 1;
  if (Seq) {
    try {
      var rows = (await Seq.findMany({ key: "projeto" })) || [];
      for (var r = 0; r < rows.length; r++) {
        var sn = Number(rows[r].next || 0);
        if (sn > proximo) proximo = sn;
      }
    } catch (e) {}
  }
  for (var t = 0; t < 50; t++) {
    var cand = proximo + t;
    var codigo = "PRJ-" + String(cand).padStart(3, "0");
    if (usado[codigo]) continue;
    if (Seq) {
      // A reserva É a criação de um id único: se outro pedido chegou antes,
      // este create falha e o laço tenta o número seguinte.
      try {
        await Seq.create({ id: "prjclaim_" + codigo, key: "claim:" + codigo, next: cand + 1, updated_at: _agora() });
      } catch (e) { continue; }
      try {
        var atuais = (await Seq.findMany({ key: "projeto" })) || [];
        if (atuais.length) await Seq.update(atuais[0].id, { next: cand + 1, updated_at: _agora() });
        else await Seq.create({ id: "prjseq", key: "projeto", next: cand + 1, updated_at: _agora() });
      } catch (e) {}
    }
    return codigo;
  }
  return "PRJ-" + String(Date.now()).slice(-6);
}

async function handler(ctx) {
  var P = ctx.models.Projeto, F = ctx.models.ProjetoFase, M = ctx.models.ProjetoMembro;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Criar projeto exige admin ou o acesso de planejamento" });

  var b = ctx.body || {};
  var nome = String(b.nome || "").trim();
  if (!nome) return ctx.reply.status(400).send({ error: "Informe o nome do projeto" });
  var tipo = String(b.tipo || "interno");
  if (["interno", "cliente"].indexOf(tipo) < 0) return ctx.reply.status(400).send({ error: "Tipo deve ser interno ou cliente" });
  var companyId = String(b.company_id || "").trim();
  if (tipo === "cliente" && !companyId) {
    return ctx.reply.status(400).send({ error: "Projeto de cliente precisa do cliente" });
  }
  if (tipo === "interno") companyId = "";

  var inicio = _dataCal(b.inicio_planejado), fim = _dataCal(b.fim_planejado);
  if (inicio === null || fim === null) return ctx.reply.status(400).send({ error: "Data deve estar no formato AAAA-MM-DD" });
  if (!_janelaValida(inicio, fim)) return ctx.reply.status(400).send({ error: "O fim não pode ser anterior ao início" });

  var codigo = await alocarCodigo(P, ctx.models.TicketSequence);
  var agora = _agora();
  var row = await P.create({
    id: _id("prj"),
    codigo: codigo,
    nome: nome.slice(0, 200),
    descricao: String(b.descricao || "").slice(0, 4000),
    tipo: tipo,
    company_id: companyId,
    status: String(b.status || "planejado"),
    inicio_planejado: inicio,
    fim_planejado: fim,
    responsavel_id: String(b.responsavel_id || eu.id || ""),
    created_at: agora,
    updated_at: agora,
    arquivado_em: "",
    criado_por: String(eu.id || ""),
  });

  // Fases iniciais: da lista enviada ou de um modelo salvo. Sem isto, quem cria
  // o quinto projeto de implantação digita as mesmas seis fases de novo.
  var fases = Array.isArray(b.fases) ? b.fases : null;
  if (!fases && b.fase_modelo_id && ctx.models.FaseModelo) {
    var modelo = await ctx.models.FaseModelo.findById(String(b.fase_modelo_id)).catch(function () { return null; });
    if (modelo) {
      try { fases = typeof modelo.fases === "string" ? JSON.parse(modelo.fases) : modelo.fases; } catch (e) { fases = null; }
    }
  }
  if (F && Array.isArray(fases)) {
    for (var i = 0; i < fases.length && i < 30; i++) {
      var f = fases[i] || {};
      if (!String(f.nome || "").trim()) continue;
      await F.create({
        id: _id("prjf"), projeto_id: row.id, nome: String(f.nome).slice(0, 120),
        ordem: Number(f.ordem !== undefined ? f.ordem : i), cor: String(f.cor || ""),
        inicio_planejado: "", fim_planejado: "", datas_manuais: false,
        created_at: agora, updated_at: agora,
      });
    }
  }
  if (M && eu.id) {
    await M.create({ id: _id("prjm"), projeto_id: row.id, user_id: String(row.responsavel_id || eu.id), papel: "responsavel", created_at: agora });
  }

  await _log(ctx, eu, "projeto_criado", row.id, "", { codigo: codigo, nome: nome, tipo: tipo });
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };
"""

# ── GET /projetos/:id ────────────────────────────────────────────────────────
DETALHE = ("""// %s — GET /projetos/:id
// Devolve o projeto com fases, membros, marcos e cards já com progresso e
// atraso calculados — a tela não recalcula regra de negócio.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var P = ctx.models.Projeto, T = ctx.models.Ticket;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeVer(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para ver projetos" });

  var p = await P.findById(String(ctx.params.id));
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var fases = ctx.models.ProjetoFase ? ((await ctx.models.ProjetoFase.findMany({ projeto_id: p.id })) || []) : [];
  var membros = ctx.models.ProjetoMembro ? ((await ctx.models.ProjetoMembro.findMany({ projeto_id: p.id })) || []) : [];
  var marcos = ctx.models.ProjetoMarco ? ((await ctx.models.ProjetoMarco.findMany({ projeto_id: p.id })) || []) : [];
  var deps = ctx.models.CardDependencia ? ((await ctx.models.CardDependencia.findMany({ projeto_id: p.id })) || []) : [];
  var brutos = T ? ((await T.findMany({ projeto_id: p.id })) || []) : [];
  var cards = brutos.map(_card);

  fases.sort(function (a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); });
  var porFase = {};
  for (var i = 0; i < brutos.length; i++) {
    var k = String(brutos[i].fase_id || "");
    (porFase[k] = porFase[k] || []).push(brutos[i]);
  }
  var fasesSaida = fases.map(function (f) {
    var meus = porFase[String(f.id)] || [];
    // Datas derivadas dos cards, a menos que alguém as tenha fixado na mão.
    var ini = "", fim = "";
    for (var j = 0; j < meus.length; j++) {
      var a = _dataCal(meus[j].inicio_planejado), z = _dataCal(meus[j].previsao_entrega);
      if (a && (!ini || a < ini)) ini = a;
      if (z && (!fim || z > fim)) fim = z;
    }
    return Object.assign({}, f, {
      total_cards: meus.length,
      progresso: _progressoDe(meus),
      inicio_efetivo: f.datas_manuais ? _dataCal(f.inicio_planejado) || "" : ini,
      fim_efetivo: f.datas_manuais ? _dataCal(f.fim_planejado) || "" : fim,
    });
  });

  var atrasados = 0;
  for (var c = 0; c < cards.length; c++) if (cards[c].atrasado) atrasados++;

  return ctx.reply.send({
    success: true,
    data: Object.assign({}, p, {
      progresso: _progressoDe(brutos),
      total_cards: cards.length,
      cards_atrasados: atrasados,
      fases: fasesSaida,
      membros: membros,
      marcos: marcos,
      dependencias: deps,
      cards: cards,
    }),
  });
}
module.exports = { handler };
"""

# ── PATCH /projetos/:id ──────────────────────────────────────────────────────
EDITAR = ("""// %s — PATCH /projetos/:id
// Arquivar é `arquivado_em`; nada aqui apaga projeto.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var P = ctx.models.Projeto;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Editar projeto exige admin ou o acesso de planejamento" });

  var p = await P.findById(String(ctx.params.id));
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });
  var b = ctx.body || {};
  if (_conflito(p, b)) {
    return ctx.reply.status(409).send({ error: "Alguém alterou este projeto enquanto você editava. Recarregue para ver a versão atual." });
  }

  var mudou = {}, antes = {};
  var textos = ["nome", "descricao", "status", "responsavel_id", "company_id"];
  for (var i = 0; i < textos.length; i++) {
    var k = textos[i];
    if (b[k] !== undefined) { antes[k] = p[k]; mudou[k] = String(b[k]).slice(0, 4000); }
  }
  var datas = ["inicio_planejado", "fim_planejado"];
  for (var d = 0; d < datas.length; d++) {
    var kd = datas[d];
    if (b[kd] === undefined) continue;
    var v = _dataCal(b[kd]);
    if (v === null) return ctx.reply.status(400).send({ error: "Data deve estar no formato AAAA-MM-DD" });
    antes[kd] = p[kd]; mudou[kd] = v;
  }
  var ini = mudou.inicio_planejado !== undefined ? mudou.inicio_planejado : _dataCal(p.inicio_planejado);
  var fim = mudou.fim_planejado !== undefined ? mudou.fim_planejado : _dataCal(p.fim_planejado);
  if (!_janelaValida(ini, fim)) return ctx.reply.status(400).send({ error: "O fim não pode ser anterior ao início" });

  if (b.arquivar === true) mudou.arquivado_em = _agora();
  if (b.arquivar === false) mudou.arquivado_em = "";

  if (!Object.keys(mudou).length) return ctx.reply.send({ success: true, data: p });
  mudou.updated_at = _agora();
  var row = await P.update(p.id, mudou);
  await _log(ctx, eu, "projeto_alterado", p.id, "", { antes: antes, depois: mudou });
  return ctx.reply.send({ success: true, data: row });
}
module.exports = { handler };
"""

# ── Fases ────────────────────────────────────────────────────────────────────
FASE_CRIAR = ("""// %s — POST /projetos/:id/fases
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var P = ctx.models.Projeto, F = ctx.models.ProjetoFase;
  if (!P || !F) return ctx.reply.status(500).send({ error: "Models de projeto ausentes" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var p = await P.findById(String(ctx.params.id));
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var b = ctx.body || {};
  var nome = String(b.nome || "").trim();
  if (!nome) return ctx.reply.status(400).send({ error: "Informe o nome da fase" });
  var existentes = (await F.findMany({ projeto_id: p.id })) || [];
  var ordem = b.ordem !== undefined ? Number(b.ordem) : existentes.length;
  var agora = _agora();
  var row = await F.create({
    id: _id("prjf"), projeto_id: p.id, nome: nome.slice(0, 120),
    ordem: isNaN(ordem) ? existentes.length : ordem, cor: String(b.cor || ""),
    inicio_planejado: "", fim_planejado: "", datas_manuais: false,
    created_at: agora, updated_at: agora,
  });
  await _log(ctx, eu, "fase_criada", p.id, "", { fase: nome });
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };
"""

FASE_EDITAR = ("""// %s — PATCH /projetos/:id/fases/:fid
// `datas_manuais` liga quando alguém fixa data na fase: a partir daí a
// derivação a partir dos cards para de sobrescrever a escolha da pessoa.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var F = ctx.models.ProjetoFase;
  if (!F) return ctx.reply.status(500).send({ error: "Model ProjetoFase missing" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var f = await F.findById(String(ctx.params.fid));
  if (!f || String(f.projeto_id) !== String(ctx.params.id)) {
    return ctx.reply.status(404).send({ error: "Fase não encontrada neste projeto" });
  }
  var b = ctx.body || {};
  if (_conflito(f, b)) return ctx.reply.status(409).send({ error: "Alguém alterou esta fase enquanto você editava." });

  var mudou = {};
  if (b.nome !== undefined) mudou.nome = String(b.nome).slice(0, 120);
  if (b.cor !== undefined) mudou.cor = String(b.cor).slice(0, 40);
  if (b.ordem !== undefined && !isNaN(Number(b.ordem))) mudou.ordem = Number(b.ordem);
  var datas = ["inicio_planejado", "fim_planejado"];
  for (var d = 0; d < datas.length; d++) {
    if (b[datas[d]] === undefined) continue;
    var v = _dataCal(b[datas[d]]);
    if (v === null) return ctx.reply.status(400).send({ error: "Data deve estar no formato AAAA-MM-DD" });
    mudou[datas[d]] = v;
    mudou.datas_manuais = true;
  }
  if (b.datas_manuais === false) {
    mudou.datas_manuais = false; mudou.inicio_planejado = ""; mudou.fim_planejado = "";
  }
  var ini = mudou.inicio_planejado !== undefined ? mudou.inicio_planejado : _dataCal(f.inicio_planejado);
  var fim = mudou.fim_planejado !== undefined ? mudou.fim_planejado : _dataCal(f.fim_planejado);
  if (!_janelaValida(ini, fim)) return ctx.reply.status(400).send({ error: "O fim não pode ser anterior ao início" });

  if (!Object.keys(mudou).length) return ctx.reply.send({ success: true, data: f });
  mudou.updated_at = _agora();
  var row = await F.update(f.id, mudou);
  await _log(ctx, eu, "fase_alterada", f.projeto_id, "", { fase: f.nome, depois: mudou });
  return ctx.reply.send({ success: true, data: row });
}
module.exports = { handler };
"""

FASE_APAGAR = ("""// %s — DELETE /projetos/:id/fases/:fid
// Apagar fase NUNCA apaga card: os cards dela voltam para "sem fase". O
// caminho óbvio e destrutivo é justamente o que não pode acontecer aqui.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var F = ctx.models.ProjetoFase, T = ctx.models.Ticket;
  if (!F) return ctx.reply.status(500).send({ error: "Model ProjetoFase missing" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var f = await F.findById(String(ctx.params.fid));
  if (!f || String(f.projeto_id) !== String(ctx.params.id)) {
    return ctx.reply.status(404).send({ error: "Fase não encontrada neste projeto" });
  }
  var soltos = 0;
  if (T) {
    var cards = (await T.findMany({ fase_id: f.id })) || [];
    for (var i = 0; i < cards.length; i++) {
      await T.update(cards[i].id, { fase_id: "" });
      soltos++;
    }
  }
  await F.delete(f.id);
  await _log(ctx, eu, "fase_removida", f.projeto_id, "", { fase: f.nome, cards_soltos: soltos });
  return ctx.reply.send({ success: true, data: { cards_soltos: soltos } });
}
module.exports = { handler };
"""

# ── Membros ──────────────────────────────────────────────────────────────────
MEMBRO_ADD = ("""// %s — POST /projetos/:id/membros
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var P = ctx.models.Projeto, M = ctx.models.ProjetoMembro;
  if (!P || !M) return ctx.reply.status(500).send({ error: "Models de projeto ausentes" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var p = await P.findById(String(ctx.params.id));
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var b = ctx.body || {};
  var userId = String(b.user_id || "").trim();
  if (!userId) return ctx.reply.status(400).send({ error: "Informe a pessoa" });
  var papel = String(b.papel || "participante");
  if (["responsavel", "participante", "observador"].indexOf(papel) < 0) {
    return ctx.reply.status(400).send({ error: "Papel inválido" });
  }
  var ja = (await M.findMany({ projeto_id: p.id, user_id: userId })) || [];
  if (ja.length) {
    var row0 = await M.update(ja[0].id, { papel: papel });
    return ctx.reply.send({ success: true, data: row0 });
  }
  var row = await M.create({ id: _id("prjm"), projeto_id: p.id, user_id: userId, papel: papel, created_at: _agora() });
  await _log(ctx, eu, "membro_adicionado", p.id, "", { user_id: userId, papel: papel });
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };
"""

MEMBRO_REM = ("""// %s — DELETE /projetos/:id/membros/:uid
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var M = ctx.models.ProjetoMembro;
  if (!M) return ctx.reply.status(500).send({ error: "Model ProjetoMembro missing" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var linhas = (await M.findMany({ projeto_id: String(ctx.params.id), user_id: String(ctx.params.uid) })) || [];
  for (var i = 0; i < linhas.length; i++) await M.delete(linhas[i].id);
  await _log(ctx, eu, "membro_removido", String(ctx.params.id), "", { user_id: String(ctx.params.uid) });
  return ctx.reply.send({ success: true, data: { removidos: linhas.length } });
}
module.exports = { handler };
"""

# ── Cards ────────────────────────────────────────────────────────────────────
CARD_ADD = ("""// %s — POST /projetos/:id/cards
// Pendurar card no projeto. NADA no Kanban Dev passa a exigir projeto: card
// sem projeto continua funcionando como sempre.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var P = ctx.models.Projeto, T = ctx.models.Ticket;
  if (!P || !T) return ctx.reply.status(500).send({ error: "Models ausentes" });
  var eu = await _perfilDe(ctx);
  if (!_podeMexerNoCard(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para mexer no card" });
  var p = await P.findById(String(ctx.params.id));
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var b = ctx.body || {};
  var ids = Array.isArray(b.ticket_ids) ? b.ticket_ids : (b.ticket_id ? [b.ticket_id] : []);
  if (!ids.length) return ctx.reply.status(400).send({ error: "Informe o card" });
  var faseId = String(b.fase_id || "");
  if (faseId && ctx.models.ProjetoFase) {
    var f = await ctx.models.ProjetoFase.findById(faseId).catch(function () { return null; });
    if (!f || String(f.projeto_id) !== String(p.id)) {
      return ctx.reply.status(400).send({ error: "Esta fase não é deste projeto" });
    }
  }

  var feitos = [];
  for (var i = 0; i < ids.length && i < 100; i++) {
    var t = await T.findById(String(ids[i])).catch(function () { return null; });
    if (!t) continue;
    if (String(t.projeto_id || "") && String(t.projeto_id) !== String(p.id)) {
      return ctx.reply.status(409).send({ error: "O card " + (t.ticket_number || t.id) + " já pertence a outro projeto" });
    }
    await T.update(t.id, { projeto_id: p.id, fase_id: faseId, updated_at: _agora() });
    await _log(ctx, eu, "card_no_projeto", p.id, t.id, { fase_id: faseId });
    feitos.push(t.id);
  }
  return ctx.reply.send({ success: true, data: { vinculados: feitos.length, ids: feitos } });
}
module.exports = { handler };
"""

CARD_EDITAR = ("""// %s — PATCH /projetos/:id/cards/:tid
// As datas de planejamento do card. `previsao_entrega` É o fim planejado —
// existe desde a decisão 17 do Kanban Dev e não ganha um irmão gêmeo aqui.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var T = ctx.models.Ticket;
  if (!T) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeMexerNoCard(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para mexer no card" });
  var t = await T.findById(String(ctx.params.tid));
  if (!t) return ctx.reply.status(404).send({ error: "Card não encontrado" });
  if (String(t.projeto_id || "") !== String(ctx.params.id)) {
    return ctx.reply.status(404).send({ error: "Este card não pertence a este projeto" });
  }
  var b = ctx.body || {};
  if (_conflito(t, b)) {
    return ctx.reply.status(409).send({ error: "Alguém alterou este card enquanto você editava. Recarregue para ver a versão atual." });
  }

  var mudou = {}, antes = {};
  var datas = ["inicio_planejado", "previsao_entrega"];
  for (var d = 0; d < datas.length; d++) {
    if (b[datas[d]] === undefined) continue;
    var v = _dataCal(b[datas[d]]);
    if (v === null) return ctx.reply.status(400).send({ error: "Data deve estar no formato AAAA-MM-DD" });
    antes[datas[d]] = t[datas[d]] || ""; mudou[datas[d]] = v;
  }
  var ini = mudou.inicio_planejado !== undefined ? mudou.inicio_planejado : _dataCal(t.inicio_planejado);
  var fim = mudou.previsao_entrega !== undefined ? mudou.previsao_entrega : _dataCal(t.previsao_entrega);
  if (!_janelaValida(ini, fim)) return ctx.reply.status(400).send({ error: "A previsão não pode ser anterior ao início" });

  if (b.estimativa_min !== undefined) {
    var est = Number(b.estimativa_min);
    if (isNaN(est) || est < 0) return ctx.reply.status(400).send({ error: "Estimativa inválida" });
    antes.estimativa_min = t.estimativa_min || 0;
    mudou.estimativa_min = Math.round(est);
  }
  if (b.progresso !== undefined) {
    if (b.progresso === null || b.progresso === "") {
      // Volta a seguir o status do fluxo Dev.
      mudou.progresso = null;
    } else {
      var pr = Number(b.progresso);
      if (isNaN(pr) || pr < 0 || pr > 100) return ctx.reply.status(400).send({ error: "Progresso deve estar entre 0 e 100" });
      antes.progresso = t.progresso; mudou.progresso = Math.round(pr);
    }
  }
  if (b.fase_id !== undefined) {
    var faseId = String(b.fase_id || "");
    if (faseId && ctx.models.ProjetoFase) {
      var f = await ctx.models.ProjetoFase.findById(faseId).catch(function () { return null; });
      if (!f || String(f.projeto_id) !== String(t.projeto_id)) {
        return ctx.reply.status(400).send({ error: "Esta fase não é deste projeto" });
      }
    }
    antes.fase_id = t.fase_id || ""; mudou.fase_id = faseId;
  }

  if (!Object.keys(mudou).length) return ctx.reply.send({ success: true, data: _card(t) });
  mudou.updated_at = _agora();
  var row = await T.update(t.id, mudou);
  await _log(ctx, eu, "card_planejamento", t.projeto_id, t.id, { antes: antes, depois: mudou });
  return ctx.reply.send({ success: true, data: _card(row) });
}
module.exports = { handler };
"""

CARD_REM = ("""// %s — DELETE /projetos/:id/cards/:tid
// Soltar limpa a fase e apaga as dependências do card — senão sobram setas
// apontando para fora do projeto. O card em si continua vivo no quadro.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var T = ctx.models.Ticket;
  if (!T) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeMexerNoCard(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para mexer no card" });
  var t = await T.findById(String(ctx.params.tid));
  if (!t) return ctx.reply.status(404).send({ error: "Card não encontrado" });
  if (String(t.projeto_id || "") !== String(ctx.params.id)) {
    return ctx.reply.status(404).send({ error: "Este card não pertence a este projeto" });
  }
  var apagadas = 0;
  var D = ctx.models.CardDependencia;
  if (D) {
    var todas = (await D.findMany({ projeto_id: String(t.projeto_id) })) || [];
    for (var i = 0; i < todas.length; i++) {
      if (String(todas[i].origem_ticket_id) === String(t.id) || String(todas[i].destino_ticket_id) === String(t.id)) {
        await D.delete(todas[i].id); apagadas++;
      }
    }
  }
  await T.update(t.id, { projeto_id: "", fase_id: "", updated_at: _agora() });
  await _log(ctx, eu, "card_fora_do_projeto", String(ctx.params.id), t.id, { dependencias_apagadas: apagadas });
  return ctx.reply.send({ success: true, data: { dependencias_apagadas: apagadas } });
}
module.exports = { handler };
"""

ROTAS = [
    ("GET", "/projetos", LISTAR),
    ("POST", "/projetos", CRIAR),
    ("GET", "/projetos/:id", DETALHE),
    ("PATCH", "/projetos/:id", EDITAR),
    ("POST", "/projetos/:id/fases", FASE_CRIAR),
    ("PATCH", "/projetos/:id/fases/:fid", FASE_EDITAR),
    ("DELETE", "/projetos/:id/fases/:fid", FASE_APAGAR),
    ("POST", "/projetos/:id/membros", MEMBRO_ADD),
    ("DELETE", "/projetos/:id/membros/:uid", MEMBRO_REM),
    ("POST", "/projetos/:id/cards", CARD_ADD),
    ("PATCH", "/projetos/:id/cards/:tid", CARD_EDITAR),
    ("DELETE", "/projetos/:id/cards/:tid", CARD_REM),
]


def main():
    aplicar = "--aplicar" in sys.argv
    c, d = req(f"{MOD}/routes")
    if c >= 300:
        print(f"! módulo projetos indisponível: HTTP {c} {d}")
        sys.exit(1)
    existentes = {(r["method"], r["path"]) for r in d["routes"]}

    # node --check em TODOS antes de gravar qualquer um: erro de sintaxe
    # publicado derruba a rota em produção (aconteceu em 18/08).
    falhou = False
    for metodo, caminho, codigo in ROTAS:
        nome = caminho.strip("/").replace("/", "_").replace(":", "")
        arq = f"/tmp/prj_{metodo.lower()}_{nome}.js"
        open(arq, "w").write(codigo)
        if subprocess.run(["node", "--check", arq]).returncode != 0:
            print(f"   ❌ sintaxe: {arq}")
            falhou = True
    if falhou:
        sys.exit(1)

    for metodo, caminho, codigo in ROTAS:
        ja = (metodo, caminho) in existentes
        print(f"   {'↻' if ja else '→'} {metodo} {caminho}: {len(codigo)} chars ({'regrava' if ja else 'nova'})")
        if not aplicar:
            continue
        c, r = req(f"{MOD}/routes", "PUT", {"method": metodo, "path": caminho, "controllerCode": codigo})
        if c >= 300:
            print(f"      ❌ HTTP {c} {r}")
            sys.exit(1)

    if not aplicar:
        print("\n   sintaxe conferida em todos (/tmp/prj_*.js)")
        print("   (simulação — use --aplicar)")
        return
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar projetos: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
