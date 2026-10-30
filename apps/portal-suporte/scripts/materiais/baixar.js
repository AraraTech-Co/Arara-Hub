async function handler(ctx) {
  var P = ctx.models.Projeto, A = ctx.models.Arquivo, C = ctx.models.ArquivoConteudo;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeVer(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para ver projetos" });
  if (!A || !C) return ctx.reply.status(404).send({ error: "Material não encontrado" });

  var projetoId = String(ctx.params.id || "");
  var m = await A.findById(String(ctx.params.mid || ""));
  // As três conferências juntas são o isolamento: id de arquivo do ACERVO
  // passado por esta rota não vira download, por mais que exista.
  if (!m || String(m.escopo || "") !== ESCOPO_MATERIAL
      || String(m.projeto_id || "") !== projetoId
      || m.apagado_em || String(m.ativo || "sim") !== "sim") {
    return ctx.reply.status(404).send({ error: "Material não encontrado" });
  }
  var p = await P.findById(projetoId);
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var c = await C.findById(String(m.id));
  if (!c || !c.conteudo) return ctx.reply.status(404).send({ error: "Conteúdo não encontrado" });
  return ctx.reply.send({
    success: true,
    data: { id: m.id, nome: m.nome, tipo: m.tipo, conteudo: c.conteudo },
  });
}
module.exports = { handler };
