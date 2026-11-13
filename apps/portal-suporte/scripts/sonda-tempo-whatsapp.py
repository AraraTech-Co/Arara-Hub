#!/usr/bin/env python3
# =============================================================================
# Sonda de tempo do WhatsApp (13/11/2026): mede o envio, o detalhe e o
# carregamento das mensagens com o uso real dos atendentes, por uma hora.
#
# Embrulha a exportação de TRÊS rotas do routes.generated.ts:
#   POST /whatsapp                (enviar mensagem pela inbox)
#   GET  /whatsapp/:id            (detalhe da conversa, painel lateral)
#   GET  /whatsapp/:id/messages   (carregar as mensagens da conversa)
#
# Por pedido, a sonda anota quanto levou cada chamada a `ctx.models` (modelo,
# operação, NOMES dos campos do filtro, linhas devolvidas) e cada `ctx.fetch`
# (só o caminho da URL, o HTTP e o tempo), e grava UM evento `diag_tempo` em
# WaConversationEvents. Lê-se em GET /whatsapp/diagnostico/chegadas?kind=diag_tempo.
#
# O que NÃO grava: texto de mensagem, telefone, nome, valor de filtro, token.
# O erro de entrega vai com toda sequência de 8+ dígitos trocada por "#".
#
# Desliga sozinha: grava só antes de SONDA_LIMITE (14:30 de Brasília de
# 13/11/2026, pedido do Leonardo). Não lê nada para decidir se grava. A gravação não é esperada:
# a resposta ao atendente não fica mais lenta por causa dela.
#
#   python3 scripts/sonda-tempo-whatsapp.py            # simula
#   python3 scripts/sonda-tempo-whatsapp.py --gravar   # grava
# =============================================================================

import argparse
import importlib.util
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
ROTAS = [("POST", "/whatsapp"), ("GET", "/whatsapp/:id"), ("GET", "/whatsapp/:id/messages")]
# A tela consulta as mensagens a cada poucos segundos com a conversa aberta:
# gravar toda chamada encheria a tabela de eventos (ver sondas-do-polling-fora).
# Nessa rota só entra a chamada lenta.
MINIMO_MS = {("GET", "/whatsapp/:id/messages"): 1000}
SONDA_LIMITE = "2026-11-13T17:30:00Z"  # 14:30 em Brasília (UTC-3)

_spec = importlib.util.spec_from_file_location("_ds", os.path.join(RAIZ, "scripts", "desativado-sem-acesso.py"))
_ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ds)

ANCORA = "module.exports = { handler: _gsComSessao };"
MARCA = "// ── Sonda de tempo (scripts/sonda-tempo-whatsapp.py) ──"

SONDA = MARCA + """
// Mede cada leitura, gravação e chamada de rede desta rota e grava um evento
// `diag_tempo` por pedido, até o horário-limite; depois dele não grava mais
// nada, sem precisar de outro deploy. Sem texto, telefone,
// nome ou valor de filtro: só modelo, operação, nomes de campo, tempos e contagens.
var _stRota = __ROTA__;
var _stLimite = Date.parse(__LIMITE__);
// Abaixo deste tempo o pedido não é gravado (0 = grava todos).
var _stMinimoMs = __MINIMO__;
function _stLigada(agora) {
  return agora < _stLimite;
}
// Por Proxy, e não copiando as chaves: assim vale para qualquer modelo que o
// handler peça, inclusive quando `ctx.models` não enumera os nomes.
function _stMedirModelos(models, passos) {
  if (!models || typeof models !== "object") return models;
  var feitos = {};
  return new Proxy(models, {
    get: function (alvo, nome) {
      var orig = alvo[nome];
      if (typeof nome !== "string" || !orig || typeof orig !== "object") return orig;
      if (!feitos[nome]) feitos[nome] = _stMedirModelo(nome, orig, passos);
      return feitos[nome];
    },
  });
}
function _stMedirModelo(nome, orig, passos) {
  var feitos = {};
  return new Proxy(orig, {
    get: function (alvo, op) {
      var f = alvo[op];
      if (typeof op !== "string" || typeof f !== "function") return f;
      if (!feitos[op]) {
        feitos[op] = async function () {
          var arg0 = arguments[0];
          var t0 = Date.now();
          var r;
          var erro = false;
          try {
            r = await f.apply(alvo, arguments);
            return r;
          } catch (e) {
            erro = true;
            throw e;
          } finally {
            if (passos.length < 80) {
              var p = { m: nome, op: op, ms: Date.now() - t0 };
              if (op === "findMany") {
                p.f = arg0 && typeof arg0 === "object" ? Object.keys(arg0).sort().join(",") : "";
                p.n = Array.isArray(r) ? r.length : null;
              }
              if (op === "findById") p.achou = !!r;
              if (erro) p.erro = true;
              passos.push(p);
            }
          }
        };
      }
      return feitos[op];
    },
  });
}
function _stMedirFetch(f, redes) {
  if (typeof f !== "function") return f;
  return async function (url, init) {
    var t0 = Date.now();
    var r;
    var erro = null;
    try {
      r = await f(url, init);
      return r;
    } catch (e) {
      erro = _stSemNumero(String((e && e.message) || e)).slice(0, 80);
      throw e;
    } finally {
      if (redes.length < 20) {
        var caminho = "";
        try { caminho = new URL(String(url)).pathname; } catch (e2) { caminho = "?"; }
        redes.push({ caminho: caminho, ms: Date.now() - t0, http: r ? r.status : null, erro: erro });
      }
    }
  };
}
function _stSemNumero(s) {
  return String(s || "").replace(/\\d{8,}/g, "#");
}
function _stGravar(ctx, d) {
  try {
    var Ev = ctx.models && ctx.models.WaConversationEvents;
    if (!Ev || typeof Ev.create !== "function") return;
    var payload = JSON.stringify(d);
    if (payload.length > 8000) {
      d.passos = d.passos.slice(0, 40);
      d.cortado = true;
      payload = JSON.stringify(d).slice(0, 8000);
    }
    Promise.resolve(Ev.create({
      id: "dtmp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      conversation_id: "diagnostico",
      kind: "diag_tempo",
      payload: payload,
      created_at: new Date().toISOString(),
    })).catch(function () {});
  } catch (e) {}
}
var _stOriginal = _gsComSessao;
async function _stComSonda(ctx) {
  var t0 = Date.now();
  if (!_stLigada(t0)) return _stOriginal(ctx);
  var passos = [];
  var redes = [];
  var enviado;
  var http = 200;
  var rep = ctx.reply;
  var rep2 = {
    status: function (c) { http = c; rep.status(c); return rep2; },
    send: function (v) { enviado = v; return rep.send(v); },
  };
  var ctx2 = Object.assign({}, ctx, {
    models: _stMedirModelos(ctx.models, passos),
    fetch: _stMedirFetch(ctx.fetch, redes),
    reply: rep2,
  });
  var falhou = null;
  try {
    return await _stOriginal(ctx2);
  } catch (e) {
    falhou = _stSemNumero(String((e && e.message) || e)).slice(0, 120);
    throw e;
  } finally {
    var b = ctx.body && typeof ctx.body === "object" ? ctx.body : {};
    var corpo = enviado && typeof enviado === "object" ? (enviado.data && typeof enviado.data === "object" ? enviado.data : enviado) : {};
    if (Date.now() - t0 >= _stMinimoMs) _stGravar(ctx, {
      rota: _stRota,
      ms: Date.now() - t0,
      http: http,
      conv: String((ctx.params && ctx.params.id) || b.conversationId || b.conversation_id || ""),
      citacao: !!b.responder_a,
      anexo: !!b.anexo,
      entregue: typeof corpo.entregue === "boolean" ? corpo.entregue : null,
      erro_entrega: corpo.erro_entrega ? _stSemNumero(corpo.erro_entrega).slice(0, 160) : null,
      falhou: falhou,
      passos: passos,
      redes: redes,
    });
  }
}
module.exports = { handler: _stComSonda };"""


def sonda_para(rota):
    return (SONDA.replace("__ROTA__", json.dumps(" ".join(rota)))
                 .replace("__MINIMO__", str(MINIMO_MS.get(rota, 0)))
                 .replace("__LIMITE__", json.dumps(SONDA_LIMITE)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args()
    texto = open(ARQ, encoding="utf-8").read()
    edicoes = []
    for rota in ROTAS:
        alvos = []
        for m in _ds.RE_ENTRADA.finditer(texto):
            met = re.search(r'method:\s*"([^"]+)"', m.group(1))
            cam = re.search(r'path:\s*"([^"]+)"', m.group(1))
            if met and cam and (met.group(1), cam.group(1)) == rota:
                alvos.append(m)
        if len(alvos) != 1:
            sys.exit(f"❌ {' '.join(rota)} aparece {len(alvos)} vez(es); nada foi gravado")
        m = alvos[0]
        enc = m.group(2)
        codigo = json.loads('"' + enc + '"')
        if MARCA in codigo:
            print(f"   {' '.join(rota)}: já aplicado")
            continue
        if codigo.count(ANCORA) != 1 or not codigo.rstrip().endswith(ANCORA):
            sys.exit(f"❌ {' '.join(rota)}: a exportação não é a esperada — nada foi gravado")
        asc = "\\u00" in enc or "\\u2" in enc
        novo = _ds.troca_codificada(enc, ANCORA, sonda_para(rota), asc)
        esperado = codigo.replace(ANCORA, sonda_para(rota))
        if novo is None:
            sys.exit(f"❌ {' '.join(rota)}: âncora codificada não casou — nada foi gravado")
        if json.loads('"' + novo + '"') != esperado:
            sys.exit(f"❌ {' '.join(rota)}: a edição codificada não bate com a pretendida — nada foi gravado")
        edicoes.append((m.start(2), m.end(2), novo))
        print(f"   {' '.join(rota)}: sonda aplicada")
    if not edicoes:
        return
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    for ini, fim, novo in sorted(edicoes, reverse=True):
        texto = texto[:ini] + novo + texto[fim:]
    open(ARQ, "w", encoding="utf-8").write(texto)
    print("   gravado")


if __name__ == "__main__":
    main()
