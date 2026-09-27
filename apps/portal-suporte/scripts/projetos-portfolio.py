#!/usr/bin/env python3
# =============================================================================
# Módulo de Projetos — Entrega 4: portfólio e saúde.
#
#   GET /projetos/portfolio    leitura
#
# UMA rota, e não "usar a lista e calcular no front": a saúde precisa varrer os
# cards e os marcos de CADA projeto, e fazer isso no navegador significaria uma
# chamada por projeto e a régua da saúde escrita duas vezes (aqui e no
# servidor), livre para divergir.
#
# A SAÚDE VEM COM OS MOTIVOS ESCRITOS. Um selo "em risco" sem dizer por quê não
# muda o comportamento de ninguém: a pessoa olha, encolhe os ombros e segue. O
# que muda comportamento é "4 cards atrasados; o marco de homologação venceu há
# 3 dias".
#
#   python3 scripts/projetos-portfolio.py            # simula
#   python3 scripts/projetos-portfolio.py --aplicar
# =============================================================================

import subprocess
import sys

from _projetos_comum import COMUM, MOD, req  # noqa: E402

MARCA = "scripts/projetos-portfolio.py"

PORTFOLIO = ("""// %s — GET /projetos/portfolio
// Todos os projetos numa régua só, com saúde e os motivos dela.
""" % MARCA) + COMUM + """
// A régua da saúde. Três estados, e cada um carrega a lista de motivos que o
// justificou — quem lê a tela precisa saber o que fazer, não só a cor.
function _saudeDe(p, cards, marcos, hoje) {
  var motivos = [];
  var grave = false;

  var atrasados = 0, semData = 0, bloqueadosPorData = 0;
  for (var i = 0; i < cards.length; i++) {
    var t = cards[i];
    if (String(t.status || "") === "descartado") continue;
    if (_atrasado(t)) atrasados++;
    if (!_dataCal(t.inicio_planejado) && !_dataCal(t.previsao_entrega)) semData++;
  }
  if (atrasados > 0) {
    motivos.push(atrasados + (atrasados === 1 ? " card atrasado" : " cards atrasados"));
    // Um card atrasado é aviso; a partir de três o projeto não está mais só
    // "apertado", está com o plano vencido.
    if (atrasados >= 3) grave = true;
  }

  var vencidos = 0, proximos = 0;
  for (var m = 0; m < marcos.length; m++) {
    var mk = marcos[m];
    if (mk.atingido_em) continue;
    var d = _dataCal(mk.data);
    if (!d) continue;
    if (d < hoje) {
      vencidos++;
      motivos.push('marco "' + String(mk.nome || "") + '" venceu em ' + d.split("-").reverse().join("/"));
      grave = true;
    } else if (_diasEntre(hoje, d) <= 7) {
      proximos++;
      motivos.push('marco "' + String(mk.nome || "") + '" vence em ' + _diasEntre(hoje, d) + " dia(s)");
    }
  }

  // Prazo do projeto vencido com trabalho em aberto.
  var fimProjeto = _dataCal(p.fim_planejado);
  var abertos = cards.filter(function (t) {
    return ["aplicado_no_cliente", "descartado"].indexOf(String(t.status || "")) < 0;
  }).length;
  if (fimProjeto && fimProjeto < hoje && abertos > 0) {
    motivos.push("o prazo do projeto venceu e ainda há " + abertos + " card(s) em aberto");
    grave = true;
  }

  if (semData > 0) {
    motivos.push(semData + " card(s) sem data no plano");
  }
  if (!cards.length) {
    motivos.push("nenhum card pendurado no projeto");
  }

  var estado = grave ? "critico" : (motivos.length ? "atencao" : "ok");
  return { estado: estado, motivos: motivos, atrasados: atrasados, marcos_vencidos: vencidos, marcos_proximos: proximos };
}

function _diasEntre(a, b) {
  var pa = a.split("-").map(Number), pb = b.split("-").map(Number);
  var ta = Date.UTC(pa[0], pa[1] - 1, pa[2]), tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86400000);
}

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
  var verArquivados = String(q.arquivados || "") === "1";
  linhas = linhas.filter(function (p) { return verArquivados ? !!p.arquivado_em : !p.arquivado_em; });

  var hoje = new Date().toISOString().slice(0, 10);
  var saida = [];
  for (var i = 0; i < linhas.length; i++) {
    var p = linhas[i];
    // Uma consulta por projeto, como na lista: varrer a tabela inteira de
    // chamados é exatamente o que foi retirado do quadro em 24/08.
    var cards = T ? ((await T.findMany({ projeto_id: String(p.id) })) || []) : [];
    var marcos = ctx.models.ProjetoMarco
      ? ((await ctx.models.ProjetoMarco.findMany({ projeto_id: String(p.id) })) || []) : [];

    // A janela desenhada é a do PLANO quando existe; senão, a que os cards
    // ocupam — projeto sem datas ainda precisa aparecer na régua.
    var ini = _dataCal(p.inicio_planejado) || "";
    var fim = _dataCal(p.fim_planejado) || "";
    for (var c = 0; c < cards.length; c++) {
      var a = _dataCal(cards[c].inicio_planejado), z = _dataCal(cards[c].previsao_entrega);
      if (a && (!ini || a < ini)) ini = a;
      if (z && (!fim || z > fim)) fim = z;
    }

    saida.push({
      id: p.id, codigo: p.codigo, nome: p.nome, tipo: p.tipo, status: p.status,
      company_id: p.company_id || "", responsavel_id: p.responsavel_id || "",
      inicio: ini, fim: fim,
      inicio_planejado: p.inicio_planejado || "", fim_planejado: p.fim_planejado || "",
      progresso: _progressoDe(cards),
      total_cards: cards.length,
      saude: _saudeDe(p, cards, marcos, hoje),
      marcos: marcos.map(function (m) {
        return { id: m.id, nome: m.nome, data: _dataCal(m.data) || "", atingido_em: m.atingido_em || "" };
      }),
    });
  }

  saida.sort(function (a, b) {
    var peso = { critico: 0, atencao: 1, ok: 2 };
    var d = peso[a.saude.estado] - peso[b.saude.estado];
    // Pior primeiro: quem abre a tela quer ver o que está pegando fogo, não a
    // ordem alfabética.
    return d !== 0 ? d : String(a.codigo || "").localeCompare(String(b.codigo || ""));
  });

  return ctx.reply.send({ success: true, data: saida, hoje: hoje });
}
module.exports = { handler };
"""

ROTAS = [("GET", "/projetos/portfolio", PORTFOLIO)]


def main():
    aplicar = "--aplicar" in sys.argv
    c, d = req(f"{MOD}/routes")
    if c >= 300:
        print(f"! módulo indisponível: HTTP {c} {d}")
        sys.exit(1)
    existentes = {(r["method"], r["path"]) for r in d["routes"]}

    for metodo, caminho, codigo in ROTAS:
        arq = "/tmp/prj4_portfolio.js"
        open(arq, "w").write(codigo)
        if subprocess.run(["node", "--check", arq]).returncode != 0:
            print(f"   ❌ sintaxe: {arq}")
            sys.exit(1)
        ja = (metodo, caminho) in existentes
        print(f"   {'↻' if ja else '→'} {metodo} {caminho}: {len(codigo)} chars ({'regrava' if ja else 'nova'})")
        if not aplicar:
            continue
        c, r = req(f"{MOD}/routes", "PUT", {"method": metodo, "path": caminho, "controllerCode": codigo})
        if c >= 300:
            print(f"      ❌ HTTP {c} {r}")
            sys.exit(1)

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar projetos: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
