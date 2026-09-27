#!/usr/bin/env python3
# =============================================================================
# Bloco comum das rotas do módulo `projetos` — identidade, permissão, datas,
# log e progresso.
#
# Vive num arquivo só porque a guarda de identidade não pode divergir entre
# scripts: duas cópias do mesmo trecho de autorização é como uma delas fica
# para trás numa correção. `projetos-regras.py` e `projetos-regras-fase3.py`
# importam daqui.
# =============================================================================

import json
import os
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/projetos"


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=240) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


# ── Bloco injetado no topo de cada controller ────────────────────────────────
COMUM = """
async function _sessaoDoPortal(ctx) {
  try {
    var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || "";
    var partes = String(h).split(".");
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    var S = ctx.models.Sessao;
    if (!S) return null;
    var linha = await S.findById("ses_" + partes[0]);
    if (!linha || linha.revogada === true) return null;
    if (String(linha.verificador || "") !== partes[1]) return null;
    if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;
    return linha.user_id || null;
  } catch (e) { return null; }
}

var _RANK = { user: 10, support: 20, developer: 30, admin: 40 };
var _APELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
function _canonico(cru) {
  var v = String(cru || "").trim().toLowerCase();
  return _RANK[v] !== undefined ? v : (_APELIDOS[v] || "");
}
async function _perfilDe(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || (await _sessaoDoPortal(ctx));
  if (!quem || !ctx.models || !ctx.models.Profile) return { id: quem, nivel: 99, grants: [], servico: !quem };
  var p = await ctx.models.Profile.findById(quem).catch(function () { return null; });
  var grants = (p && (p.feature_grants || p.featureGrants)) || [];
  if (!Array.isArray(grants)) grants = [];
  return { id: quem, nivel: _RANK[_canonico(p ? p.role : "")] || 0, grants: grants, servico: false };
}
// Ver: quem já vê o Kanban Dev. Planejar: admin ou o grant `planejamento` —
// existe para liberar uma pessoa a planejar sem promovê-la a administradora do
// portal, no mesmo desenho de `code_review` e `qa`.
function _podeVer(eu) {
  return eu.servico || eu.nivel >= _RANK.developer || eu.grants.indexOf("qa") >= 0;
}
function _podePlanejar(eu) {
  return eu.servico || eu.nivel >= _RANK.admin || eu.grants.indexOf("planejamento") >= 0;
}
function _podeMexerNoCard(eu) {
  return eu.servico || eu.nivel >= _RANK.developer || eu.grants.indexOf("planejamento") >= 0;
}

function _agora() { return new Date().toISOString(); }
function _id(pre) {
  return pre + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Data de CALENDÁRIO. Timestamp aqui faz o prazo de 27/08 virar dia 26 para
// quem estiver num fuso a oeste — e o portal é usado de vários lugares.
function _dataCal(v) {
  if (v === null || v === undefined || v === "") return "";
  var s = String(v).slice(0, 10);
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(s) ? s : null;
}
function _janelaValida(inicio, fim) {
  if (!inicio || !fim) return true;
  return inicio <= fim;
}

// Progresso derivado do status do fluxo Dev. Ninguém digita "62%" num card; o
// status já diz onde a coisa está. `progresso` preenchido vence — é o escape
// para quem discordar.
var _PCT = {
  no_status: 0, backlog: 0,
  em_desenvolvimento: 25, teste_reprovado: 40,
  desenvolvimento_finalizado: 50,
  pronto_para_teste: 70, em_testes: 80, teste_aprovado: 90,
  aplicado_no_cliente: 100,
};
function _progressoDoCard(t) {
  if (t.progresso !== null && t.progresso !== undefined && t.progresso !== "") {
    var m = Number(t.progresso);
    if (!isNaN(m)) return Math.max(0, Math.min(100, m));
  }
  var p = _PCT[String(t.status || "")];
  return p === undefined ? 0 : p;
}
// Média ponderada pela estimativa (peso 1 para card sem estimativa). Card
// descartado sai do denominador: se ficasse, o projeto ENCOLHERIA de progresso
// ao descartar trabalho morto.
function _progressoDe(cards) {
  var soma = 0, peso = 0;
  for (var i = 0; i < (cards || []).length; i++) {
    var t = cards[i];
    if (String(t.status || "") === "descartado") continue;
    var w = Number(t.estimativa_min || 0) > 0 ? Number(t.estimativa_min) : 1;
    soma += _progressoDoCard(t) * w;
    peso += w;
  }
  return peso === 0 ? 0 : Math.round(soma / peso);
}
function _atrasado(t) {
  var fim = _dataCal(t.previsao_entrega);
  if (!fim) return false;
  if (["aplicado_no_cliente", "descartado"].indexOf(String(t.status || "")) >= 0) return false;
  return fim < new Date().toISOString().slice(0, 10);
}

// Campos do card que o planejamento usa. A resposta é enxuta pelo mesmo motivo
// do quadro: `description` não cabe numa lista.
var _CAMPOS_CARD = ["id", "ticket_number", "title", "status", "quadro", "severity",
  "priority", "assigned_to", "company_id", "company_name", "unit_id", "version",
  "projeto_id", "fase_id", "inicio_planejado", "previsao_entrega", "estimativa_min",
  "progresso", "resolved_at", "created_at", "updated_at"];
function _card(t) {
  var o = {};
  for (var i = 0; i < _CAMPOS_CARD.length; i++) {
    if (t[_CAMPOS_CARD[i]] !== undefined) o[_CAMPOS_CARD[i]] = t[_CAMPOS_CARD[i]];
  }
  o.progresso_efetivo = _progressoDoCard(t);
  o.atrasado = _atrasado(t);
  return o;
}

// Histórico: reusa o ActivityLog que já registra as movimentações do quadro
// desde 18/08. Um segundo sistema de histórico só criaria mais um lugar para
// procurar quando alguém perguntar "quem mudou essa data?".
async function _log(ctx, eu, acao, projetoId, ticketId, detalhes) {
  try {
    var L = ctx.models.ActivityLog;
    if (!L) return;
    await L.create({
      id: _id("plog"),
      action: acao,
      projeto_id: projetoId || "",
      ticket_id: ticketId || "",
      user_id: eu && eu.id ? String(eu.id) : "",
      details: JSON.stringify(detalhes || {}).slice(0, 900),
      occurred_at: _agora(),
      created_at: _agora(),
      visible_to_client: false,
    });
  } catch (e) {}
}

// Concorrência otimista (§49 do PRD): quem grava manda o updated_at que leu.
function _conflito(row, body) {
  var visto = String((body && (body.updated_at || body.updatedAt)) || "");
  if (!visto) return false;
  var atual = String(row.updated_at || "");
  return !!atual && atual !== visto;
}
"""

