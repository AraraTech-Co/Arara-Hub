#!/usr/bin/env python3
# =============================================================================
# Só o master concede permissão extra, e só o master dá ou tira o papel master.
#
# Decisão do Leonardo (29/10/2026): "a concessao somente master pode dar".
#
# ONDE ISSO MORA, conferido nos 510 handlers: só a 286 `PUT /profiles/:id`
# grava `feature_grants` num Profile a partir do corpo. As outras rotas de
# perfil montam a lista de campos explicitamente e não incluem permissão —
# 490b `POST /admin/membros`, 490j a ativação, 162 e 163 do fluxo de convite.
# A 285 `POST /profiles/:id/role` é um stub que responde 501 e não grava nada.
#
# AS DUAS REGRAS SÃO DIFERENTES DE PROPÓSITO:
#
#   - permissão extra: DESCARTADA do corpo de quem não é master. A tela manda
#     `feature_grants` em todo salvar, junto de nome e telefone; recusar faria
#     o admin não conseguir mais editar nada de um membro. E o bloco de
#     permissões extras só aparece para o master, então o que o admin manda é
#     o valor que ele mesmo carregou: descartar não muda nada para ele;
#
#   - papel master: RECUSADO com 403, e só quando o papel MUDA. Aqui o
#     silêncio mentiria: a tela oferece "Master" no seletor de papel a quem
#     está editando, e um descarte calado deixaria o admin escolher Master,
#     salvar, ver "usuário atualizado" e nada acontecer. Recusar só na mudança
#     mantém o admin editando nome e telefone de um master, porque aí o papel
#     vai no corpo igual ao que já está gravado.
#
# A TERCEIRA REGRA: os campos que decidem PARA ONDE vai o código de
# recuperação de senha. Sem ela, a trava do papel não vale nada:
#
#   `POST /auth/senha/solicitar` (handler 171) acha o perfil pelo EMAIL
#   (`_perfilPorEmail`, linha 52) e manda o código para o `perfil.phone`
#   (linha 53). `POST /auth/senha/redefinir` (handler 170) confere o código e
#   grava a senha na plataforma. Então quem puder trocar o telefone de um
#   master recebe o código no próprio WhatsApp e entra como ele — sem nunca ter
#   mudado papel nem permissão.
#
# Por isso: alvo master, e quem chama não é master nem o próprio → mudar `phone`
# ou `email` é recusado. Valor igual passa, pela mesma razão do papel.
#
# O telefone é comparado em DÍGITOS: a tela manda "+55 (19) 99999-9999" e o
# banco guarda "5519999999999", e comparar como texto acusaria mudança onde não
# houve. O email, em minúsculas e sem espaço, que é como a recuperação o lê.
#
# A CHECAGEM É NO PAPEL CRU, e não no nível: `_APELIDOS` mapeia master → admin,
# então `_canon("master")` devolve "admin" e qualquer comparação com "master"
# depois de canonizar é SEMPRE falsa. O nível também não serve, pelo mesmo
# motivo: master e admin têm o mesmo.
#
#   python3 scripts/trava-permissao-master.py            # simula
#   python3 scripts/trava-permissao-master.py --aplicar   # grava o arquivo
#
# (`--aplicar` grava APENAS o arquivo do repositório. Não fala com a
# plataforma: quem publica é o deploy, pelo merge em master.)
# =============================================================================

import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "packages", "api", "src", "apps", "portal-suporte",
    "routes.generated.ts"))
MARCA = "// 286 profiles PUT /profiles/:id"

# O trecho que já existe e que delimita onde a trava entra.
ANTIGO = '''  delete _corpo.id;
'''

NOVO = r'''  delete _corpo.id;

  // Só o MASTER concede permissão extra. A checagem é no papel CRU: `_APELIDOS`
  // mapeia master → admin, então `_canon("master")` devolve "admin" e comparar
  // depois de canonizar seria sempre falso. O nível também não distingue os
  // dois.
  var _souMaster = String((_meu && _meu.role) || "").trim().toLowerCase() === "master";
  if (!_souMaster) {
    delete _corpo.feature_grants;
    delete _corpo.featureGrants;
  }

  // O alvo é lido UMA vez: as duas travas abaixo dependem do que ele é hoje.
  var _alvo = null;
  if (!_souMaster && (_corpo.role !== undefined || _corpo.phone !== undefined
      || _corpo.email !== undefined || _corpo.active !== undefined
      || _corpo.expires_at !== undefined)) {
    _alvo = await model.findById(id).catch(function () { return null; });
  }
  var _papelDoAlvo = String((_alvo && _alvo.role) || "").trim().toLowerCase();
  var _alvoEhMaster = _papelDoAlvo === "master";

  // Só o master DÁ ou TIRA o papel master — e só quando o papel muda. A tela
  // manda `role` em todo salvar: recusar um papel igual ao que já está gravado
  // impediria o admin de editar nome e telefone de um master.
  if (_corpo.role !== undefined && !_souMaster) {
    // `trim().toLowerCase()` nos DOIS lados: sem normalizar o que vem do
    // corpo, "Master" ou " MASTER " passariam pela comparação e seriam
    // gravados — e `_souMaster`, que normaliza, passaria a contar essa pessoa
    // como master.
    var _papelNovo = String(_corpo.role || "").trim().toLowerCase();
    if (_papelNovo !== _papelDoAlvo && (_papelNovo === "master" || _alvoEhMaster)) {
      return ctx.reply.status(403).send({ error: "Só o master pode dar ou tirar o papel master" });
    }
  }

  // Os campos que decidem para ONDE vai o código de recuperação de senha. Sem
  // esta trava, trocar o telefone de um master entrega a conta dele: o código
  // chega no WhatsApp de quem trocou (ver `POST /auth/senha/solicitar`, que
  // acha o perfil pelo email e manda o código para o `phone` do cadastro).
  //
  // O próprio master segue mudando os seus — e isso sai de graça de
  // `!_souMaster`: se quem chama FOSSE o alvo master, o papel lido em `_meu`
  // seria master e o bloco nem rodaria. Por isso não há conferência de
  // "sou eu mesmo" aqui: ela seria condição morta.
  if (_alvoEhMaster && !_souMaster) {
    var _digitos = function (v) { return String(v === null || v === undefined ? "" : v).replace(/\D/g, ""); };
    var _mail = function (v) { return String(v === null || v === undefined ? "" : v).trim().toLowerCase(); };
    var _mudaFone = _corpo.phone !== undefined
      && _digitos(_corpo.phone) !== _digitos(_alvo && _alvo.phone);
    var _mudaMail = _corpo.email !== undefined
      && _mail(_corpo.email) !== _mail(_alvo && _alvo.email);
    if (_mudaFone || _mudaMail) {
      return ctx.reply.status(403).send({
        error: "Só o master pode mudar o telefone ou o e-mail de um master",
      });
    }

    // Desativar ou expirar um master é tirá-lo do ar: quem administra o portal
    // não pode fazer isso ao dono por conta própria.
    //
    // `active` é comparado como booleano e `expires_at` como data de
    // calendário: a tela manda `expires_at` em todo salvar, e um timestamp
    // contra "AAAA-MM-DD" acusaria mudança onde não houve.
    var _bool = function (v) { return v === true || String(v) === "true"; };
    var _dia = function (v) { return String(v === null || v === undefined ? "" : v).trim().slice(0, 10); };
    var _mudaAtivo = _corpo.active !== undefined
      && _bool(_corpo.active) !== _bool(_alvo && _alvo.active);
    var _mudaValidade = _corpo.expires_at !== undefined
      && _dia(_corpo.expires_at) !== _dia(_alvo && _alvo.expires_at);
    if (_mudaAtivo || _mudaValidade) {
      return ctx.reply.status(403).send({
        error: "Só o master pode desativar ou expirar um master",
      });
    }
  }
'''


# ── 490b POST /admin/membros ─────────────────────────────────────────────────
# A rota troca a SENHA da conta da plataforma (`ctx.users.setPassword`) antes de
# ler o perfil. Com o e-mail de um master e o campo `senha`, um admin redefinia
# a senha dele direto — sem papel, sem permissão e sem recuperação no meio.
#
# O conserto é de ORDEM, não só de condição: o perfil passa a ser lido antes, e
# a recusa vem antes de qualquer gravação. A leitura antiga, que acontecia
# depois, reusa o mesmo resultado para não ir ao banco duas vezes.
MARCA_MEMBROS = "// 490b profiles POST /admin/membros"

ANTIGO_MEMBROS = """  var uid = String(conta.id);

  if (senha) {"""

NOVO_MEMBROS = r"""  var uid = String(conta.id);

  // O perfil é lido ANTES de qualquer gravação: `setPassword` vem logo abaixo,
  // e conferir a permissão depois dele seria conferir com a senha já trocada.
  var _perfilAlvo = null;
  try { _perfilAlvo = await Perfil.findById(uid); } catch (e) { _perfilAlvo = null; }
  // Papel CRU nos dois lados: `canonico` mapeia master para admin, e o RANK
  // não distingue os dois.
  var _alvoEhMaster = String((_perfilAlvo && _perfilAlvo.role) || "").trim().toLowerCase() === "master";
  var _souMaster = String((g.perfil && g.perfil.role) || "").trim().toLowerCase() === "master";
  if (_alvoEhMaster && !_souMaster) {
    return ctx.reply.status(403).send({
      success: false,
      error: "Só o master pode re-adicionar um master",
    });
  }

  if (senha) {"""

ANTIGO_MEMBROS2 = """  var existente = null;
  try { existente = await Perfil.findById(uid); } catch (e) { existente = null; }"""

NOVO_MEMBROS2 = """  // Já lido acima, antes da senha: ler de novo seria uma segunda ida ao banco
  // para a mesma resposta.
  var existente = _perfilAlvo;"""


# ── 490j POST /admin/membros/:id/ativacao ────────────────────────────────────
# Desativar um master é tirá-lo do ar. A rota exigia apenas nível de admin.
MARCA_ATIVACAO = "// 490j profiles POST /admin/membros/:id/ativacao"

ANTIGO_ATIVACAO = """  return { quem: String(quem) };"""
NOVO_ATIVACAO = """  return { quem: String(quem), perfil: perfil };"""

ANTIGO_ATIVACAO2 = """  if (!perfil) return ctx.reply.status(404).send({ success: false, error: "Membro não encontrado" });"""
NOVO_ATIVACAO2 = r"""  if (!perfil) return ctx.reply.status(404).send({ success: false, error: "Membro não encontrado" });
  // Só o master ativa ou desativa um master: papel CRU nos dois lados, porque
  // `canonico` mapeia master para admin e o RANK não distingue os dois.
  if (String(perfil.role || "").trim().toLowerCase() === "master"
      && String((g.perfil && g.perfil.role) || "").trim().toLowerCase() !== "master") {
    return ctx.reply.status(403).send({
      success: false,
      error: "Só o master pode ativar ou desativar um master",
    });
  }"""


def literal(texto, at):
    """O literal do handler que começa depois de `at`."""
    abre = texto.index('compileController(', at)
    i = texto.index('"', abre)
    j = i + 1
    while True:
        if texto[j] == "\\":
            j += 2
            continue
        if texto[j] == '"':
            break
        j += 1
    return i, j + 1, json.loads(texto[i:j + 1])


def main():
    aplicar = "--aplicar" in sys.argv
    texto = open(ROTAS, encoding="utf-8").read()
    if texto.count(MARCA) != 1:
        raise SystemExit(f"! a marca do handler 286 aparece {texto.count(MARCA)}x")
    at = texto.index(MARCA)
    i, j, cod = literal(texto, at)

    feitos = []
    if "_souMaster" in cod:
        # Aplicar de novo DUPLICARIA a trava: a âncora (`delete _corpo.id;`)
        # continua presente depois da primeira aplicação.
        feitos.append("286 PUT /profiles/:id (já aplicada)")
    else:
        # O que a trava pressupõe do handler, conferido e não suposto.
        for exigido in ("var _meu = await model.findById(_quem)",
                        "const model = ctx.models.Profile;",
                        "await model.update(id, _corpo)"):
            if exigido not in cod:
                raise SystemExit(f"! o handler 286 não tem {exigido!r}")
        if cod.count(ANTIGO) != 1:
            raise SystemExit(f"! âncora aparece {cod.count(ANTIGO)}x no handler 286")
        novo_cod = cod.replace(ANTIGO, NOVO)
        # A trava TEM de entrar antes da gravação.
        if novo_cod.index("_souMaster") > novo_cod.index("await model.update(id, _corpo)"):
            raise SystemExit("! a trava ficaria depois da gravação")
        texto = texto[:i] + json.dumps(novo_cod) + texto[j:]
        feitos.append("286 PUT /profiles/:id")

    # As outras duas rotas, cada uma com as suas âncoras.
    for marca, pares, nome in [
        (MARCA_MEMBROS,
         [(ANTIGO_MEMBROS, NOVO_MEMBROS), (ANTIGO_MEMBROS2, NOVO_MEMBROS2)],
         "490b POST /admin/membros"),
        (MARCA_ATIVACAO,
         [(ANTIGO_ATIVACAO, NOVO_ATIVACAO), (ANTIGO_ATIVACAO2, NOVO_ATIVACAO2)],
         "490j POST /admin/membros/:id/ativacao"),
    ]:
        if texto.count(marca) != 1:
            raise SystemExit(f"! a marca de {nome} aparece {texto.count(marca)}x")
        at2 = texto.index(marca)
        i2, j2, cod2 = literal(texto, at2)
        if "Só o master pode" in cod2:
            feitos.append(nome + " (já aplicada)")
            continue
        novo_cod2 = cod2
        for de, para in pares:
            if novo_cod2.count(de) != 1:
                raise SystemExit(f"! âncora em {nome} aparece {novo_cod2.count(de)}x: {de[:60]!r}")
            novo_cod2 = novo_cod2.replace(de, para)
        # A recusa TEM de vir antes de qualquer gravação, em cada rota.
        #
        # Medido SEM COMENTÁRIOS: o comentário que explica a trava cita
        # `setPassword`, e comparar sobre o texto cru fazia a conferência achar
        # a própria explicação em vez da chamada.
        sem_comentario = "\n".join(
            l for l in novo_cod2.split("\n") if not l.strip().startswith("//"))
        for antes_de in ("await ctx.users.setPassword(", "await Perfil.update(", "await P.update("):
            if antes_de in sem_comentario and \
                    sem_comentario.index("Só o master pode") > sem_comentario.index(antes_de):
                raise SystemExit(f"! em {nome} a recusa ficaria depois de {antes_de}")
        texto = texto[:i2] + json.dumps(novo_cod2) + texto[j2:]
        feitos.append(nome)

    if not aplicar:
        for f in feitos:
            print(f"   → poria a trava em {f}")
        print("\n   (simulação — use --aplicar)")
        return
    open(ROTAS, "w", encoding="utf-8").write(texto)
    for f in feitos:
        print(f"→ trava aplicada em {f}")


if __name__ == "__main__":
    main()
