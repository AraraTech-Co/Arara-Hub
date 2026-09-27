#!/usr/bin/env python3
# =============================================================================
# Módulo de Projetos — Entrega 3: dependências e marcos no servidor.
#
#   POST   /projetos/:id/dependencias         planejamento
#   DELETE /projetos/:id/dependencias/:did    planejamento
#   POST   /projetos/:id/marcos               planejamento
#   PATCH  /projetos/:id/marcos/:mid          planejamento
#   DELETE /projetos/:id/marcos/:mid          planejamento
#
# O CICLO É RECUSADO AQUI, não na tela. "A depende de B, B depende de A" trava
# o planejamento inteiro e não tem como ser desfeito por quem só vê uma das
# duas pontas — e uma trava só de tela não é trava: qualquer chamada direta à
# rota passaria por cima dela.
#
# O arrasto das barras não precisa de rota nova: ele grava pela
# PATCH /projetos/:id/cards/:tid que já existe, com o mesmo `updated_at` de
# concorrência otimista. Mover barra e digitar data são o mesmo caminho.
#
#   python3 scripts/projetos-regras-fase3.py            # simula
#   python3 scripts/projetos-regras-fase3.py --aplicar
# =============================================================================

import subprocess
import sys

from _projetos_comum import COMUM, MOD, req  # noqa: E402

MARCA = "scripts/projetos-regras-fase3.py"

# ── Dependências ─────────────────────────────────────────────────────────────
DEP_CRIAR = ("""// %s — POST /projetos/:id/dependencias
// "O card B só começa depois que o A for aplicado no cliente."
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var P = ctx.models.Projeto, T = ctx.models.Ticket, D = ctx.models.CardDependencia;
  if (!P || !T || !D) return ctx.reply.status(500).send({ error: "Models ausentes" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });

  var projetoId = String(ctx.params.id);
  var p = await P.findById(projetoId);
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var b = ctx.body || {};
  var origem = String(b.origem_ticket_id || "").trim();
  var destino = String(b.destino_ticket_id || "").trim();
  if (!origem || !destino) return ctx.reply.status(400).send({ error: "Informe os dois cards" });
  if (origem === destino) return ctx.reply.status(400).send({ error: "Um card não depende de si mesmo" });

  // Os dois lados precisam ser deste projeto — senão a seta apontaria para fora
  // e nenhuma das duas telas conseguiria desenhá-la.
  var a = await T.findById(origem).catch(function () { return null; });
  var z = await T.findById(destino).catch(function () { return null; });
  if (!a || !z) return ctx.reply.status(404).send({ error: "Card não encontrado" });
  if (String(a.projeto_id || "") !== projetoId || String(z.projeto_id || "") !== projetoId) {
    return ctx.reply.status(400).send({ error: "Os dois cards precisam ser deste projeto" });
  }

  var existentes = (await D.findMany({ projeto_id: projetoId })) || [];
  for (var i = 0; i < existentes.length; i++) {
    if (String(existentes[i].origem_ticket_id) === origem &&
        String(existentes[i].destino_ticket_id) === destino) {
      return ctx.reply.status(409).send({ error: "Essa dependência já existe" });
    }
  }

  // ── Ciclo ──
  // A aresta nova é origem → destino. Há ciclo se, saindo de DESTINO pelas
  // arestas que já existem, dá para chegar em ORIGEM. Busca em profundidade
  // com marcação de visitados: sem ela, um ciclo já gravado faria esta própria
  // checagem rodar para sempre.
  var saidas = {};
  for (var j = 0; j < existentes.length; j++) {
    var de = String(existentes[j].origem_ticket_id);
    (saidas[de] = saidas[de] || []).push(String(existentes[j].destino_ticket_id));
  }
  var pilha = [destino];
  var visto = {};
  var caminho = [];
  while (pilha.length) {
    var atual = pilha.pop();
    if (atual === origem) {
      return ctx.reply.status(409).send({
        error: "Essa ligação criaria um ciclo: os cards ficariam esperando uns aos outros para sempre.",
      });
    }
    if (visto[atual]) continue;
    visto[atual] = true;
    caminho.push(atual);
    var proximos = saidas[atual] || [];
    for (var k = 0; k < proximos.length; k++) pilha.push(proximos[k]);
  }

  var row = await D.create({
    id: _id("prjd"),
    projeto_id: projetoId,
    origem_ticket_id: origem,
    destino_ticket_id: destino,
    tipo: "fim_para_inicio",
    created_at: _agora(),
    criado_por: String(eu.id || ""),
  });
  await _log(ctx, eu, "dependencia_criada", projetoId, destino, {
    origem: a.ticket_number || origem,
    destino: z.ticket_number || destino,
  });
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };
"""

DEP_APAGAR = ("""// %s — DELETE /projetos/:id/dependencias/:did
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var D = ctx.models.CardDependencia;
  if (!D) return ctx.reply.status(500).send({ error: "Model CardDependencia missing" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var linha = await D.findById(String(ctx.params.did)).catch(function () { return null; });
  if (!linha || String(linha.projeto_id) !== String(ctx.params.id)) {
    return ctx.reply.status(404).send({ error: "Dependência não encontrada neste projeto" });
  }
  await D.delete(linha.id);
  await _log(ctx, eu, "dependencia_removida", String(ctx.params.id), String(linha.destino_ticket_id), {});
  return ctx.reply.send({ success: true, data: { removida: true } });
}
module.exports = { handler };
"""

# ── Marcos ───────────────────────────────────────────────────────────────────
MARCO_CRIAR = ("""// %s — POST /projetos/:id/marcos
// Marco é data sem duração: entrega, homologação, virada.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var P = ctx.models.Projeto, M = ctx.models.ProjetoMarco;
  if (!P || !M) return ctx.reply.status(500).send({ error: "Models ausentes" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var p = await P.findById(String(ctx.params.id));
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var b = ctx.body || {};
  var nome = String(b.nome || "").trim();
  if (!nome) return ctx.reply.status(400).send({ error: "Informe o nome do marco" });
  var data = _dataCal(b.data);
  if (!data) return ctx.reply.status(400).send({ error: "Informe a data no formato AAAA-MM-DD" });

  var agora = _agora();
  var row = await M.create({
    id: _id("prjm"), projeto_id: p.id, nome: nome.slice(0, 160),
    data: data, atingido_em: "", created_at: agora, updated_at: agora,
  });
  await _log(ctx, eu, "marco_criado", p.id, "", { marco: nome, data: data });
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };
"""

MARCO_EDITAR = ("""// %s — PATCH /projetos/:id/marcos/:mid
// `atingido: true` carimba a data de HOJE. O marco continua com a data
// planejada — é a comparação entre as duas que conta a história.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var M = ctx.models.ProjetoMarco;
  if (!M) return ctx.reply.status(500).send({ error: "Model ProjetoMarco missing" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var m = await M.findById(String(ctx.params.mid)).catch(function () { return null; });
  if (!m || String(m.projeto_id) !== String(ctx.params.id)) {
    return ctx.reply.status(404).send({ error: "Marco não encontrado neste projeto" });
  }
  var b = ctx.body || {};
  if (_conflito(m, b)) return ctx.reply.status(409).send({ error: "Alguém alterou este marco enquanto você editava." });

  var mudou = {};
  if (b.nome !== undefined) {
    var nome = String(b.nome).trim();
    if (!nome) return ctx.reply.status(400).send({ error: "O marco precisa de nome" });
    mudou.nome = nome.slice(0, 160);
  }
  if (b.data !== undefined) {
    var data = _dataCal(b.data);
    if (!data) return ctx.reply.status(400).send({ error: "Data deve estar no formato AAAA-MM-DD" });
    mudou.data = data;
  }
  if (b.atingido === true) mudou.atingido_em = _agora();
  if (b.atingido === false) mudou.atingido_em = "";

  if (!Object.keys(mudou).length) return ctx.reply.send({ success: true, data: m });
  mudou.updated_at = _agora();
  var row = await M.update(m.id, mudou);
  await _log(ctx, eu, "marco_alterado", m.projeto_id, "", { marco: m.nome, depois: mudou });
  return ctx.reply.send({ success: true, data: row });
}
module.exports = { handler };
"""

MARCO_APAGAR = ("""// %s — DELETE /projetos/:id/marcos/:mid
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var M = ctx.models.ProjetoMarco;
  if (!M) return ctx.reply.status(500).send({ error: "Model ProjetoMarco missing" });
  var eu = await _perfilDe(ctx);
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão de planejamento" });
  var m = await M.findById(String(ctx.params.mid)).catch(function () { return null; });
  if (!m || String(m.projeto_id) !== String(ctx.params.id)) {
    return ctx.reply.status(404).send({ error: "Marco não encontrado neste projeto" });
  }
  await M.delete(m.id);
  await _log(ctx, eu, "marco_removido", m.projeto_id, "", { marco: m.nome });
  return ctx.reply.send({ success: true, data: { removido: true } });
}
module.exports = { handler };
"""

ROTAS = [
    ("POST", "/projetos/:id/dependencias", DEP_CRIAR),
    ("DELETE", "/projetos/:id/dependencias/:did", DEP_APAGAR),
    ("POST", "/projetos/:id/marcos", MARCO_CRIAR),
    ("PATCH", "/projetos/:id/marcos/:mid", MARCO_EDITAR),
    ("DELETE", "/projetos/:id/marcos/:mid", MARCO_APAGAR),
]


def main():
    aplicar = "--aplicar" in sys.argv
    c, d = req(f"{MOD}/routes")
    if c >= 300:
        print(f"! módulo projetos indisponível: HTTP {c} {d}")
        sys.exit(1)
    existentes = {(r["method"], r["path"]) for r in d["routes"]}

    falhou = False
    for metodo, caminho, codigo in ROTAS:
        nome = caminho.strip("/").replace("/", "_").replace(":", "")
        arq = f"/tmp/prj3_{metodo.lower()}_{nome}.js"
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
        print("\n   sintaxe conferida em todos (/tmp/prj3_*.js)")
        print("   (simulação — use --aplicar)")
        return
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar projetos: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
