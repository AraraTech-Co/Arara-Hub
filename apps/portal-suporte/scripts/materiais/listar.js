async function handler(ctx) {
  var P = ctx.models.Projeto, A = ctx.models.Arquivo;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeVer(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para ver projetos" });

  var projetoId = String(ctx.params.id || "");
  var p = await P.findById(projetoId);
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });
  if (!A) return ctx.reply.send({ success: true, data: { materiais: [] } });

  // FILTRO na camada, nunca varredura: a tabela de arquivos é a do acervo
  // inteiro do portal e a leitura para em 500. Sem o filtro, o material deste
  // projeto sumiria da lista assim que o acervo passasse das 500 linhas mais
  // novas — sem erro nenhum.
  var linhas = (await A.findMany({ projeto_id: projetoId, limit: 500 })) || [];
  var saida = [];
  for (var i = 0; i < linhas.length; i++) {
    var a = linhas[i];
    if (!a || !a.id) continue;
    // Cinto e suspensório sobre o filtro, e a trava do escopo: material de
    // projeto é só o que foi gravado como material de projeto.
    if (String(a.escopo || "") !== ESCOPO_MATERIAL) continue;
    if (String(a.projeto_id || "") !== projetoId) continue;
    // O estado do material é só `apagado_em`: ele não grava `ativo`, para não
    // entrar no filtro da listagem do acervo.
    if (a.apagado_em) continue;
    saida.push({
      id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho,
      dono_id: a.dono_id, criado_em: a.criado_em || a.created_at || "",
    });
  }
  saida.sort(function (x, y) {
    var ax = String(y.criado_em || ""), bx = String(x.criado_em || "");
    if (ax !== bx) return ax < bx ? -1 : 1;
    return String(x.id) < String(y.id) ? -1 : 1;
  });
  return ctx.reply.send({ success: true, data: { materiais: saida } });
}
module.exports = { handler };
