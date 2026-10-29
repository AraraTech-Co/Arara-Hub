#!/usr/bin/env python3
# =============================================================================
# Módulo de Projetos — atividades próprias do projeto.
#
#   GET   /projetos/:id/atividades          ver o módulo
#   POST  /projetos/:id/atividades          escrever
#   PATCH /projetos/:id/atividades/:aid     escrever
#
# Base: plano técnico de 28/10/2026 (docs/portal-suporte/
# 2026-10-28-analise-kanban-por-projeto.md), §6. As decisões A–D do Leonardo
# dizem que a atividade é do PROJETO e que Projetos é independente do card Dev.
#
# ── Por que entidade própria, e não `Ticket` nem `Task` ──────────────────────
# `Ticket` tem leitores que NÃO distinguem quadro — auto-fechamento, mapa de
# calor, contexto da empresa, causa-raiz — e o padrão de leitura trata ausência
# de `quadro` ou valor diferente de "dev" como suporte. Uma atividade gravada
# como Ticket entraria nesses contadores e nas filas de chamado. `Task` e as 9
# rotas `/tasks` gravam o corpo inteiro sem lista branca, filtram pela query e
# devolvem 501 em `assign` e `complete` — não é base de nada. Daí
# `ProjetoAtividade`, model próprio, sem leitor antigo.
#
# ── O que estas rotas NUNCA fazem ────────────────────────────────────────────
# Não escrevem em `Ticket`, `CardDependencia`, `Projeto` nem `ProjetoFase`, e
# não gravam no `ActivityLog`. O log do portal é lido com reserva
# `findMany({})`, que devolve as 500 linhas mais novas do log INTEIRO: evento de
# atividade empurraria evento de chamado para fora da janela da auditoria, e o
# efeito sobrevive a reverter o código. O histórico da atividade fica em
# `ProjetoAtividadeEvento`, só dela.
#
# ── Decidido pelo Leonardo em 29/10/2026 ─────────────────────────────────────
#   - D2, as 7 etapas na ordem: backlog, em_desenvolvimento, finalizado_dev,
#     pronto_para_teste, teste_aprovado, teste_reprovado, deploy_feito;
#   - D3, cancelar: `cancelada` sai do quadro e da conta e fica no histórico.
#     Não existe apagar;
#   - D4, progresso: contagem simples, e conta como concluída SÓ `deploy_feito`.
#     O total exclui a cancelada;
#   - D5, obrigatórios na criação: título, responsável, prazo e descrição. O
#     PATCH também não pode esvaziar nenhum dos quatro;
#   - D6c, quem mexe: criar é só de quem planeja; editar e mover é de quem
#     planeja OU do responsável daquela atividade; developer comum só vê.
#
# ── O que AQUI é protótipo, e não decisão dele ───────────────────────────────
#   - trocar o RESPONSÁVEL é só de quem planeja. Não foi perguntado a ele;
#   - sem dependência entre atividades (D11) e sem notificação (D14);
#   - D10 (bloqueio manual), D12 (identificador visível) e o teto de 10.000
#     continuam em aberto.
#
# ── Leitura acima de 500: o que está resolvido e o que NÃO está ─────────────
# A camada tem teto de 500 por leitura, `offset`, ordem só por `created_at DESC`
# e nenhum desempate. Esta entrega faz páginas de 500 com `offset`,
# desduplicação por id, ordenação em memória e teto de páginas com recusa
# explícita: acima do teto a rota responde 409 e NÃO devolve total nenhum,
# porque resumo pela metade apresentado como completo é pior que recusa.
#
# O que isso NÃO resolve, e fica dito para ninguém confiar além da conta: até
# 500 atividades é UMA página, e o total é exato. Acima de 500, a
# desduplicação cuida da linha REPETIDA, mas não há como recuperar a linha
# PULADA na virada de página quando duas têm o mesmo `created_at` — sem
# desempate na camada, a segunda página pode começar depois dela. Nesse caso o
# total sai MENOR, sem 409 e sem aviso. A barreira T4 (§11 do plano) continua
# ABERTA acima de 500; fechá-la é desempate na camada, que é mudança de
# plataforma e precisa de autorização.
#
#   python3 scripts/projetos-atividades.py                  # simula (node --check)
#   python3 scripts/projetos-atividades.py --sync-routes     # grava em routes.generated.ts
#   python3 scripts/projetos-atividades.py --aplicar         # publica na plataforma
# =============================================================================

import ast
import json
import os
import subprocess
import sys

# O bloco comum vem de `_projetos_comum.py` por leitura do literal, e NÃO por
# `import`: aquele módulo lê `.env.local` e a chave privada da plataforma no
# momento do import, e este script não precisa de nenhuma das duas para conferir
# sintaxe ou escrever em `routes.generated.ts`. Quem precisa é só o `--aplicar`,
# que importa lá dentro. Ler o literal garante o MESMO texto do bloco comum —
# uma segunda cópia da guarda de identidade é como uma delas fica para trás numa
# correção.
def _comum():
    arq = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_projetos_comum.py")
    arvore = ast.parse(open(arq, encoding="utf-8").read())
    for no in arvore.body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", "") == "COMUM":
            return no.value.value
    raise SystemExit("! COMUM não encontrado em _projetos_comum.py")


def _comum_sem_card(texto):
    """O bloco comum SEM a parte que é do card Dev.

    A guarda de identidade e as permissões vêm inteiras do arquivo comum, que é
    o ponto de não divergir. Já `_PCT`, `_progressoDoCard`, `_progressoDe`,
    `_atrasado`, `_CAMPOS_CARD`, `_card` e `_log` são do card: nenhuma rota de
    atividade os usa, e deixá-los aqui seria pior que redundância. `_log` grava
    no `ActivityLog`, e o plano promete que atividade NÃO grava lá — código
    morto que grava no lugar errado é o que uma edição distraída chama por
    engano. Os dois recortes são por âncora de ocorrência única; faltando
    qualquer uma, o script para em vez de recortar no lugar errado.
    """
    recortes = [
        ("// Progresso derivado do status do fluxo Dev.", "// Histórico: reusa o ActivityLog"),
        ("// Histórico: reusa o ActivityLog", "// Concorrência otimista"),
    ]
    for de, ate in recortes:
        if texto.count(de) != 1 or texto.count(ate) != 1:
            raise SystemExit(f"! âncora de recorte não é única: {de!r} / {ate!r}")
        i, j = texto.index(de), texto.index(ate)
        if not i < j:
            raise SystemExit(f"! âncoras fora de ordem: {de!r} antes de {ate!r}")
        texto = texto[:i] + texto[j:]
    for proibido in ("ActivityLog", "_PCT", "_CAMPOS_CARD", "_progressoDe", "function _card("):
        if proibido in texto:
            raise SystemExit(f"! bloco comum ainda menciona {proibido}")
    return texto


COMUM = _comum_sem_card(_comum())


def _guarda_de_sessao():
    """O bloco de guarda de sessão, lido do `guarda-sessao.py`.

    `_perfilDe` trata "sem pessoa" como chamada de serviço (`servico: true`,
    nível 99), e `_podeVer`/`_podePlanejar` liberam quem é serviço. Sem a
    guarda na frente, qualquer credencial aceita pelo app — a chave de API não
    carrega pessoa — passaria por cima das três permissões. É o mesmo furo que
    o `guarda-sessao.py` fechou nas outras rotas, e foi o teste desta entrega
    que o pegou aqui.

    Lido de lá, e não escrito à mão, pelo motivo de sempre: duas cópias da
    guarda é como uma delas fica para trás numa correção.
    """
    arq = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guarda-sessao.py")
    arvore = ast.parse(open(arq, encoding="utf-8").read())
    for no in arvore.body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", "") == "GUARDA":
            return no.value.value
    raise SystemExit("! GUARDA não encontrado em guarda-sessao.py")


GUARDA = _guarda_de_sessao()
# `projetos` tem piso de sessão `user` no `guarda-sessao.py` (linha "projetos"),
# porque a regra de verdade são as três permissões do módulo. Mesmo piso aqui.
PISO = "user"


def com_guarda(codigo):
    """Envolve o handler exportado, como o `guarda-sessao.py` faz nas outras."""
    alvo = "module.exports = { handler };"
    if codigo.count(alvo) != 1:
        raise SystemExit(f"! export do handler não é único: {codigo.count(alvo)}x")
    bloco = GUARDA % {"marca": "scripts/guarda-sessao.py", "anterior": "handler", "minimo": PISO}
    return codigo.replace(alvo, bloco.lstrip("\n"))

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.abspath(
    os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
)
MARCA = "scripts/projetos-atividades.py"

# ── Bloco comum das atividades ───────────────────────────────────────────────
ATIV = """
// ── Atividades do projeto ────────────────────────────────────────────────────
// As 7 etapas do fluxo, na ordem, decididas pelo Leonardo em 29/10/2026. É uma
// LISTA ORDENADA e não um conjunto: a ordem é a do quadro, e mover para a
// etapa seguinte é andar um passo nela.
//
// `teste_reprovado` é etapa do fluxo, não erro: trabalho reprovado volta a ser
// trabalho, e por isso conta no total como qualquer outra.
var _ST_FLUXO = ["backlog", "em_desenvolvimento", "finalizado_dev",
  "pronto_para_teste", "teste_aprovado", "teste_reprovado", "deploy_feito"];

// `cancelada` existe e fica VISÍVEL, mas fora do fluxo e fora do denominador
// do progresso: se contasse, cancelar trabalho que não vai acontecer derrubaria
// o percentual do projeto, e quem cancela estaria sendo punido por organizar a
// lista. Não existe apagar atividade — cancelar é o que há.
var _ST_ATIV = _ST_FLUXO.concat(["cancelada"]);

// Onde a atividade nasce, e a única etapa que conta como pronta.
var _ST_INICIAL = "backlog";
var _ST_PRONTO = "deploy_feito";

// D5: os quatro campos que o cadastro exige. Valem na CRIAÇÃO e também no
// PATCH, que não pode esvaziar nenhum deles — exigir no nascimento e deixar
// apagar depois é a mesma regra valendo pela metade.
var _OBRIG_ATIV = ["titulo", "descricao", "responsavel_id", "previsao_entrega"];
var _CAMPOS_ATIV = ["id", "projeto_id", "fase_id", "titulo", "descricao", "status",
  "ordem", "responsavel_id", "inicio_planejado", "previsao_entrega", "estimativa_min",
  "concluida_em", "cancelada_em", "criado_por", "created_at", "updated_at"];

function _ativ(a) {
  var o = {};
  for (var i = 0; i < _CAMPOS_ATIV.length; i++) {
    if (a[_CAMPOS_ATIV[i]] !== undefined) o[_CAMPOS_ATIV[i]] = a[_CAMPOS_ATIV[i]];
  }
  o.atrasada = _ativAtrasada(a);
  return o;
}

// Mesma regra de atraso dos cards, pelos mesmos motivos: data de calendário, e
// item terminal nunca atrasa. O "hoje" daqui é UTC do servidor, igual ao resto
// do módulo — o fuso de negócio é trilha separada (§9 do plano, decisão D9).
function _ativAtrasada(a) {
  var fim = _dataCal(a.previsao_entrega);
  if (!fim) return false;
  // Terminal é o que não tem mais prazo a cumprir: no ar, ou cancelada.
  if ([_ST_PRONTO, "cancelada"].indexOf(String(a.status || "")) >= 0) return false;
  return fim < new Date().toISOString().slice(0, 10);
}

// Contagem simples (D4, decidida em 29/10): conta como concluída SÓ a etapa
// `deploy_feito`. Trabalho em teste aprovado ainda não está no ar, e tratá-lo
// como pronto faria o projeto parecer entregue antes de existir entrega.
// Sem atividade, 0 — e não 100, que faria projeto vazio parecer pronto.
//
// `por_status` substitui os contadores de `a_fazer` e `em_andamento`: com 7
// etapas, dois contadores fixos deixariam cinco etapas invisíveis, e manter
// chaves de etapas que não existem mais seria devolver zero para sempre.
function _resumoAtiv(lista) {
  var total = 0, concluidas = 0, canceladas = 0, atrasadas = 0;
  var porStatus = {};
  for (var k = 0; k < _ST_ATIV.length; k++) porStatus[_ST_ATIV[k]] = 0;
  for (var i = 0; i < (lista || []).length; i++) {
    var s = String(lista[i].status || "");
    if (porStatus[s] !== undefined) porStatus[s]++;
    if (s === "cancelada") { canceladas++; continue; }
    total++;
    if (s === _ST_PRONTO) concluidas++;
    if (_ativAtrasada(lista[i])) atrasadas++;
  }
  return {
    total: total, concluidas: concluidas, canceladas: canceladas,
    atrasadas: atrasadas, por_status: porStatus,
    progresso: total === 0 ? 0 : Math.round((concluidas * 100) / total),
  };
}

// Leitura por páginas de 500 com teto. `_PAGINAS_ATIV * 500` é o máximo que uma
// resposta cobre; passando disso a rota RECUSA em vez de devolver meia lista.
//
// Exato até 500 (uma página). Acima disso a desduplicação cuida da linha
// repetida, mas a linha PULADA na virada de página, em empate de `created_at`,
// não tem como ser recuperada aqui: a camada não oferece desempate, e o total
// pode sair menor sem nenhum aviso.
var _PAGINAS_ATIV = 20;
async function _atividadesDoProjeto(ctx, projetoId) {
  var A = ctx.models.ProjetoAtividade;
  if (!A) return { erro: "modelo", lista: [] };
  var vistos = {}, lista = [], pagina = 0;
  while (pagina < _PAGINAS_ATIV) {
    var bloco = (await A.findMany({ projeto_id: String(projetoId), limit: 500, offset: pagina * 500 })) || [];
    for (var i = 0; i < bloco.length; i++) {
      var id = String(bloco[i].id || "");
      // Desduplicação por id: em empate de `created_at` a camada não garante
      // desempate, e a mesma linha pode voltar em duas páginas.
      if (!id || vistos[id]) continue;
      vistos[id] = 1;
      lista.push(bloco[i]);
    }
    if (bloco.length < 500) {
      lista.sort(function (a, b) {
        var oa = Number(a.ordem || 0), ob = Number(b.ordem || 0);
        if (oa !== ob) return oa - ob;
        var ca = String(a.created_at || ""), cb = String(b.created_at || "");
        if (ca !== cb) return ca < cb ? -1 : 1;
        return String(a.id || "") < String(b.id || "") ? -1 : 1;
      });
      return { erro: "", lista: lista };
    }
    pagina++;
  }
  return { erro: "teto", lista: [] };
}

function _tituloValido(v) {
  var s = String(v === null || v === undefined ? "" : v).trim();
  if (!s) return null;
  return s.slice(0, 200);
}

// Em branco é o que não serve para nenhum dos quatro obrigatórios: string
// vazia, só espaço, null, undefined. Zero e `false` não aparecem nestes
// campos, mas `String()` os preservaria, e por isso não se usa `!v` aqui.
function _emBranco(v) {
  return String(v === null || v === undefined ? "" : v).trim() === "";
}

// O nome que vai na mensagem de erro, para quem recebe o 400 saber qual campo
// faltou em vez de procurar.
var _ROTULO_ATIV = {
  titulo: "título", descricao: "descrição",
  responsavel_id: "responsável", previsao_entrega: "prazo",
};
function _faltaObrigatorio(valores) {
  for (var i = 0; i < _OBRIG_ATIV.length; i++) {
    var c = _OBRIG_ATIV[i];
    if (_emBranco(valores[c])) return _ROTULO_ATIV[c] || c;
  }
  return "";
}
"""

# O histórico próprio das atividades. Fica no bloco das atividades para as três
# rotas terem a MESMA função — duas cópias de um gravador de histórico é como
# uma delas para de gravar um campo.
LOG_ATIV = """
// Histórico PRÓPRIO. Não usa o `ActivityLog` do portal: os leitores de lá têm
// reserva `findMany({})`, que devolve as 500 linhas mais novas do log inteiro,
// e evento de atividade empurraria evento de chamado para fora da auditoria.
async function _logAtiv(ctx, eu, acao, projetoId, atividadeId, detalhes) {
  try {
    var L = ctx.models.ProjetoAtividadeEvento;
    if (!L) return;
    await L.create({
      id: _id("pae"),
      action: acao,
      projeto_id: projetoId || "",
      atividade_id: atividadeId || "",
      user_id: eu && eu.id ? String(eu.id) : "",
      details: JSON.stringify(detalhes || {}).slice(0, 900),
      occurred_at: _agora(),
      created_at: _agora(),
    });
  } catch (e) {}
}
"""

ATIV = ATIV + LOG_ATIV

# ── GET /projetos/:id/atividades ─────────────────────────────────────────────
LISTAR = ("""// %s — GET /projetos/:id/atividades
// A lista e o resumo do projeto, só de atividades. Não lê `Ticket` nem
// `CardDependencia`: a independência da decisão B começa aqui.
""" % MARCA) + COMUM + ATIV + """
async function handler(ctx) {
  var P = ctx.models.Projeto;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeVer(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para ver projetos" });

  var p = await P.findById(String(ctx.params.id));
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var r = await _atividadesDoProjeto(ctx, p.id);
  if (r.erro === "modelo") return ctx.reply.status(500).send({ error: "Model ProjetoAtividade missing" });
  if (r.erro === "teto") {
    return ctx.reply.status(409).send({
      error: "Este projeto tem atividades acima do que uma leitura cobre. Nenhum total foi calculado.",
      limite: _PAGINAS_ATIV * 500,
    });
  }

  var q = ctx.query || {};
  var lista = r.lista;
  // O recorte é do servidor para `fase_id` e `status` porque a tela pagina; o
  // RESUMO continua sobre a lista inteira, senão o percentual mudaria ao
  // filtrar, e um percentual que muda com o filtro não é progresso do projeto.
  var resumo = _resumoAtiv(lista);
  if (q.fase_id !== undefined) {
    var fid = String(q.fase_id || "");
    lista = lista.filter(function (a) { return String(a.fase_id || "") === fid; });
  }
  if (q.status) {
    var st = String(q.status);
    lista = lista.filter(function (a) { return String(a.status || "") === st; });
  }

  return ctx.reply.send({
    success: true,
    data: { atividades: lista.map(_ativ), resumo: resumo },
  });
}
module.exports = { handler };
"""

# ── POST /projetos/:id/atividades ────────────────────────────────────────────
CRIAR = ("""// %s — POST /projetos/:id/atividades
// Cria atividade DENTRO do projeto. O projeto vem da URL, nunca do corpo: aceitar
// `projeto_id` no corpo deixaria quem pode escrever num projeto escrever em
// qualquer outro.
""" % MARCA) + COMUM + ATIV + """
async function handler(ctx) {
  var P = ctx.models.Projeto, A = ctx.models.ProjetoAtividade;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  if (!A) return ctx.reply.status(500).send({ error: "Model ProjetoAtividade missing" });
  var eu = await _perfilDe(ctx);
  // D6c (29/10): CRIAR é só de quem planeja. Developer comum vê e, sendo
  // responsável, mexe na sua atividade — mas não abre atividade nova.
  if (!_podePlanejar(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para criar atividades" });

  var projetoId = String(ctx.params.id);
  var p = await P.findById(projetoId);
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var b = ctx.body || {};
  // Os quatro obrigatórios conferidos ANTES de qualquer outra validação: quem
  // esqueceu o responsável tem de ouvir isso, e não um erro de data.
  var falta = _faltaObrigatorio({
    titulo: b.titulo, descricao: b.descricao,
    responsavel_id: b.responsavel_id, previsao_entrega: b.previsao_entrega,
  });
  if (falta) return ctx.reply.status(400).send({ error: "Informe o " + falta + " da atividade" });

  var titulo = _tituloValido(b.titulo);
  if (!titulo) return ctx.reply.status(400).send({ error: "Informe o título da atividade" });

  var status = String(b.status || _ST_INICIAL);
  if (_ST_ATIV.indexOf(status) < 0) return ctx.reply.status(400).send({ error: "Status de atividade inválido" });

  var faseId = String(b.fase_id || "");
  if (faseId) {
    var F = ctx.models.ProjetoFase;
    var f = F ? await F.findById(faseId).catch(function () { return null; }) : null;
    if (!f || String(f.projeto_id) !== projetoId) {
      return ctx.reply.status(400).send({ error: "Esta fase não é deste projeto" });
    }
  }

  var ini = _dataCal(b.inicio_planejado);
  var fim = _dataCal(b.previsao_entrega);
  if (ini === null || fim === null) return ctx.reply.status(400).send({ error: "Data deve estar no formato AAAA-MM-DD" });
  if (!_janelaValida(ini, fim)) return ctx.reply.status(400).send({ error: "A previsão não pode ser anterior ao início" });

  var est = 0;
  if (b.estimativa_min !== undefined && b.estimativa_min !== null && b.estimativa_min !== "") {
    est = Number(b.estimativa_min);
    if (isNaN(est) || est < 0) return ctx.reply.status(400).send({ error: "Estimativa inválida" });
    est = Math.round(est);
  }

  var ordem = 0;
  if (b.ordem !== undefined && b.ordem !== null && b.ordem !== "") {
    ordem = Number(b.ordem);
    if (isNaN(ordem)) return ctx.reply.status(400).send({ error: "Ordem inválida" });
    ordem = Math.round(ordem);
  }

  // Lista branca: o que não está aqui NÃO é gravado, venha o que vier no corpo.
  // É o que impede um `projeto_id`, um `created_at` ou um campo inventado de
  // entrar no registro junto com os campos legítimos.
  var nova = {
    id: _id("pativ"),
    projeto_id: projetoId,
    fase_id: faseId,
    titulo: titulo,
    descricao: String(b.descricao === null || b.descricao === undefined ? "" : b.descricao).slice(0, 4000),
    status: status,
    ordem: ordem,
    responsavel_id: String(b.responsavel_id || ""),
    inicio_planejado: ini,
    previsao_entrega: fim,
    estimativa_min: est,
    concluida_em: status === _ST_PRONTO ? _agora() : "",
    cancelada_em: status === "cancelada" ? _agora() : "",
    criado_por: eu && eu.id ? String(eu.id) : "",
    created_at: _agora(),
    updated_at: _agora(),
  };
  var row = await A.create(nova);
  await _logAtiv(ctx, eu, "atividade_criada", projetoId, nova.id, { titulo: titulo, status: status });
  return ctx.reply.status(201).send({ success: true, data: _ativ(row || nova) });
}
module.exports = { handler };
"""

# ── PATCH /projetos/:id/atividades/:aid ──────────────────────────────────────
EDITAR = ("""// %s — PATCH /projetos/:id/atividades/:aid
// Edita e MOVE a atividade. Arrastar no Kanban e digitar no formulário são o
// mesmo caminho: uma trava que só existisse na tela não é trava, porque a
// chamada direta à rota passaria por cima dela.
""" % MARCA) + COMUM + ATIV + """
async function handler(ctx) {
  var A = ctx.models.ProjetoAtividade;
  if (!A) return ctx.reply.status(500).send({ error: "Model ProjetoAtividade missing" });
  var eu = await _perfilDe(ctx);
  // Duas portas, em ordem. Primeiro ALCANÇAR o módulo: quem não alcança não
  // recebe nem 404 nem 403 de atividade, e por isso não descobre o que existe.
  //
  // `_podeVer` sozinho não serve aqui: ele é developer+ ou grant `qa`, e quem
  // tem o grant `planejamento` sem nível de developer CRIA atividade (a porta
  // do POST) — travar o PATCH nele deixaria essa pessoa criando o que não
  // poderia editar depois.
  if (!_podeVer(eu) && !_podePlanejar(eu)) {
    return ctx.reply.status(403).send({ error: "Sem permissão para ver atividades" });
  }

  var projetoId = String(ctx.params.id);
  var a = await A.findById(String(ctx.params.aid));
  if (!a) return ctx.reply.status(404).send({ error: "Atividade não encontrada" });
  // A atividade tem de ser DESTE projeto. Sem esta conferência, o id na URL
  // seria decoração e qualquer atividade seria editável por qualquer projeto.
  if (String(a.projeto_id || "") !== projetoId) {
    return ctx.reply.status(404).send({ error: "Esta atividade não é deste projeto" });
  }

  // D6c (29/10): editar e mover é de quem planeja OU do responsável DAQUELA
  // atividade. A conferência exige responsável preenchido: comparar dois
  // vazios daria `true` e abriria a atividade sem responsável para qualquer
  // pessoa que enxergue o módulo.
  var _dono = String(a.responsavel_id || "");
  var _souEu = String((eu && eu.id) || "");
  var _souODono = _dono !== "" && _souEu !== "" && _dono === _souEu;
  if (!_podePlanejar(eu) && !_souODono) {
    return ctx.reply.status(403).send({ error: "Só quem planeja ou o responsável pode mexer nesta atividade" });
  }

  var b = ctx.body || {};
  if (_conflito(a, b)) {
    return ctx.reply.status(409).send({ error: "Alguém alterou esta atividade enquanto você editava. Recarregue para ver a versão atual." });
  }

  // Nenhum dos quatro obrigatórios pode ser esvaziado depois. Conferido sobre
  // o que o corpo MANDA, campo a campo: o que não vem no corpo não muda.
  for (var o = 0; o < _OBRIG_ATIV.length; o++) {
    var campo = _OBRIG_ATIV[o];
    if (b[campo] !== undefined && _emBranco(b[campo])) {
      return ctx.reply.status(400).send({ error: "O " + (_ROTULO_ATIV[campo] || campo) + " não pode ficar em branco" });
    }
  }

  var mudou = {}, antes = {};
  if (b.titulo !== undefined) {
    var titulo = _tituloValido(b.titulo);
    if (!titulo) return ctx.reply.status(400).send({ error: "Informe o título da atividade" });
    antes.titulo = a.titulo || ""; mudou.titulo = titulo;
  }
  if (b.descricao !== undefined) {
    mudou.descricao = String(b.descricao === null ? "" : b.descricao).slice(0, 4000);
  }
  if (b.status !== undefined) {
    var status = String(b.status || "");
    if (_ST_ATIV.indexOf(status) < 0) return ctx.reply.status(400).send({ error: "Status de atividade inválido" });
    antes.status = a.status || ""; mudou.status = status;
    // O carimbo acompanha o status, nos dois sentidos: reabrir uma atividade
    // tem de LIMPAR o `concluida_em`, senão ela volta para a coluna como se
    // ainda tivesse data de conclusão.
    mudou.concluida_em = status === _ST_PRONTO ? (a.concluida_em || _agora()) : "";
    mudou.cancelada_em = status === "cancelada" ? (a.cancelada_em || _agora()) : "";
  }
  var datas = ["inicio_planejado", "previsao_entrega"];
  for (var d = 0; d < datas.length; d++) {
    if (b[datas[d]] === undefined) continue;
    var v = _dataCal(b[datas[d]]);
    if (v === null) return ctx.reply.status(400).send({ error: "Data deve estar no formato AAAA-MM-DD" });
    antes[datas[d]] = a[datas[d]] || ""; mudou[datas[d]] = v;
  }
  var ini = mudou.inicio_planejado !== undefined ? mudou.inicio_planejado : _dataCal(a.inicio_planejado);
  var fim = mudou.previsao_entrega !== undefined ? mudou.previsao_entrega : _dataCal(a.previsao_entrega);
  if (!_janelaValida(ini, fim)) return ctx.reply.status(400).send({ error: "A previsão não pode ser anterior ao início" });

  if (b.estimativa_min !== undefined) {
    var est = Number(b.estimativa_min === null || b.estimativa_min === "" ? 0 : b.estimativa_min);
    if (isNaN(est) || est < 0) return ctx.reply.status(400).send({ error: "Estimativa inválida" });
    antes.estimativa_min = a.estimativa_min || 0; mudou.estimativa_min = Math.round(est);
  }
  if (b.ordem !== undefined) {
    var ordem = Number(b.ordem === null || b.ordem === "" ? 0 : b.ordem);
    if (isNaN(ordem)) return ctx.reply.status(400).send({ error: "Ordem inválida" });
    antes.ordem = a.ordem || 0; mudou.ordem = Math.round(ordem);
  }
  if (b.responsavel_id !== undefined) {
    // PROTÓTIPO, não regra aprovada: TROCAR o responsável é só de quem
    // planeja. Não foi perguntado ao Leonardo. O motivo de não deixar no
    // responsável: ele poderia passar a atividade adiante e sair da própria
    // porta, ou tomar para si a atividade de outra pessoa.
    //
    // A recusa é só quando o valor MUDA. O formulário manda o objeto inteiro,
    // então o responsável manda o próprio id junto de qualquer edição —
    // recusar aí o deixaria sem conseguir salvar nada na atividade dele, que é
    // justamente o que a porta de cima acabou de permitir.
    var _novoDono = String(b.responsavel_id || "");
    var _mudaDono = _novoDono !== String(a.responsavel_id || "");
    if (_mudaDono && !_podePlanejar(eu)) {
      return ctx.reply.status(403).send({ error: "Só quem planeja pode trocar o responsável" });
    }
    // Valor igual não entra em `mudou`: gravar o mesmo dado mexeria no
    // `updated_at` e levaria o próximo PATCH a um 409 sem motivo.
    if (_mudaDono) {
      antes.responsavel_id = a.responsavel_id || "";
      mudou.responsavel_id = _novoDono;
    }
  }
  if (b.fase_id !== undefined) {
    var faseId = String(b.fase_id || "");
    if (faseId) {
      var F = ctx.models.ProjetoFase;
      var f = F ? await F.findById(faseId).catch(function () { return null; }) : null;
      if (!f || String(f.projeto_id) !== projetoId) {
        return ctx.reply.status(400).send({ error: "Esta fase não é deste projeto" });
      }
    }
    antes.fase_id = a.fase_id || ""; mudou.fase_id = faseId;
  }

  if (!Object.keys(mudou).length) return ctx.reply.send({ success: true, data: _ativ(a) });
  mudou.updated_at = _agora();
  var row = await A.update(a.id, mudou);
  await _logAtiv(ctx, eu, "atividade_alterada", projetoId, a.id, { antes: antes, depois: mudou });
  return ctx.reply.send({ success: true, data: _ativ(row || Object.assign({}, a, mudou)) });
}
module.exports = { handler };
"""


ROTAS = [
    ("GET", "/projetos/:id/atividades", "projetos-atividades-listar", com_guarda(LISTAR)),
    ("POST", "/projetos/:id/atividades", "projetos-atividades-criar", com_guarda(CRIAR)),
    ("PATCH", "/projetos/:id/atividades/:aid", "projetos-atividades-editar", com_guarda(EDITAR)),
]


def conferir_sintaxe():
    """Cada literal compila por si. Handler que não compila derruba a rota em
    produção, e o `tsc` do repositório não enxerga dentro da string."""
    falhou = False
    for metodo, caminho, fonte, codigo in ROTAS:
        arq = os.path.join(os.environ.get("TMPDIR", "/tmp"), f"pativ_{fonte}.js")
        open(arq, "w").write(codigo)
        if subprocess.run(["node", "--check", arq]).returncode != 0:
            print(f"   ❌ sintaxe: {arq}")
            falhou = True
        else:
            print(f"   ✓ {metodo} {caminho}: {len(codigo)} chars")
    if falhou:
        sys.exit(1)


def sync_routes():
    """Acrescenta as rotas ao fim do array de `routes.generated.ts`.

    Ao FIM de propósito: os comentários `// N module METHOD path` numeram por
    posição, e inserir no meio erraria o número de todas as rotas seguintes. O
    casador escolhe por método e caminho, com a de menos parâmetros ganhando e
    empate pela ordem de registro, então a posição não muda qual rota atende —
    conferido em `packages/api/src/lib/route-matcher.ts`.
    """
    texto = open(ROUTES, encoding="utf-8").read()

    # Âncora: o fecho do array exportado. Tem de ocorrer UMA vez. Âncora que
    # casa em dois lugares põe o bloco onde ninguém olhou, e `find` devolvendo
    # -1 põe o bloco no cabeçalho do arquivo — as duas já custaram deploy.
    ancora = "\n]\n"
    n = texto.count(ancora)
    if n != 1:
        print(f"! âncora de fim de array ocorre {n}x — abortado")
        sys.exit(1)

    # Idempotente por SUBSTITUIÇÃO, não por desistência. Pular quando as rotas
    # já existem é o mecanismo exato que deixou o `em_revisao` só no arquivo
    # gerado: o script deixa de ser a fonte, a correção não chega ao arquivo e
    # alguém edita o gerado à mão. Então: tira os blocos desta marca e põe os
    # novos, com o total de handlers conferido no fim.
    marca_bloco = f"({MARCA})\n"
    existentes = texto.count(marca_bloco)
    if existentes:
        if existentes != len(ROTAS):
            print(f"! {existentes} blocos desta marca, esperava {len(ROTAS)} — abortado")
            sys.exit(1)
        primeiro = texto.index(f"  // ")
        corte = texto.index(marca_bloco)
        # Recua até o início do comentário do primeiro bloco desta marca.
        corte = texto.rindex("\n  // ", primeiro, corte) + 1
        descartado = texto[corte:]
        if descartado.count("    handler: compileController(") != len(ROTAS):
            print("! o trecho a substituir não tem exatamente as rotas desta marca — abortado")
            sys.exit(1)
        if descartado.count(marca_bloco) != len(ROTAS):
            print("! o trecho a substituir pegaria bloco de outra marca — abortado")
            sys.exit(1)
        # O array volta a terminar como terminava antes de a marca entrar.
        texto = texto[:corte].rstrip()
        if not texto.endswith("  },"):
            print("! o trecho anterior à marca não termina em `  },` — abortado")
            sys.exit(1)
        texto = texto[: -len(",")] + "\n]\n"
        if texto.count(ancora) != 1:
            print("! âncora de fim de array não voltou a ser única — abortado")
            sys.exit(1)

    total_antes = texto.count("    handler: compileController(")
    blocos = []
    for i, (metodo, caminho, fonte, codigo) in enumerate(ROTAS):
        blocos.append(
            "  // %d projetos %s %s (%s)\n"
            "  {\n"
            '    module: "projetos",\n'
            '    method: "%s",\n'
            '    path: "%s",\n'
            '    authMode: "actor",\n'
            "    webhookSecretName: null,\n"
            "    requiredPermissions: [],\n"
            '    source: "%s",\n'
            "    handler: compileController(%s),\n"
            "  }"
            % (total_antes + i, metodo, caminho, MARCA, metodo, caminho, fonte, json.dumps(codigo))
        )

    # Sem vírgula no último bloco: o `gerado-estrutura.test.js` exige que o
    # arquivo termine em `  }` e `]`, que é o que o codegen emite.
    novo = texto.replace(ancora, ",\n" + ",\n".join(blocos) + "\n]\n", 1)
    total_depois = novo.count("    handler: compileController(")
    if total_depois != total_antes + len(ROTAS):
        print(f"! total de handlers foi de {total_antes} para {total_depois} — abortado")
        sys.exit(1)
    open(ROUTES, "w", encoding="utf-8").write(novo)
    verbo = "regravadas" if existentes else "acrescentadas"
    print(f"✓ {len(ROTAS)} rotas de atividade {verbo} em routes.generated.ts ({total_antes} → {total_depois} handlers)")


def aplicar_na_plataforma():
    # Só aqui a chave da plataforma é necessária, e por isso o import vem agora.
    from _projetos_comum import MOD, req  # noqa: PLC0415

    c, d = req(f"{MOD}/routes")
    if c >= 300:
        print(f"! módulo projetos indisponível: HTTP {c} {d}")
        sys.exit(1)
    for metodo, caminho, _fonte, codigo in ROTAS:
        c, r = req(f"{MOD}/routes", "PUT", {"method": metodo, "path": caminho, "controllerCode": codigo})
        print(f"   {metodo} {caminho}: HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar projetos: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    conferir_sintaxe()
    if "--sync-routes" in sys.argv:
        sync_routes()
    elif "--aplicar" in sys.argv:
        aplicar_na_plataforma()
    else:
        print("\n   sintaxe conferida (simulação)")
        print("   --sync-routes grava em routes.generated.ts; --aplicar publica na plataforma")
