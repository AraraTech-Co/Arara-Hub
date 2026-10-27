#!/usr/bin/env python3
# POST /whatsapp/:id/reopen — reabre conversa concluída, mantendo o ticket.
#
# Sync local: python3 scripts/conversa-reabrir.py --sync-routes
#
# O fonte NÃO é escrito aqui inteiro: ele é COPIADO do `POST /whatsapp/:id/resolve`
# e só o corpo de `async function handler` é trocado. É de propósito — a trava de
# conta, a guarda de sessão e o controle de acesso por nível ficam byte a byte
# iguais aos da rota irmã, em vez de reescritos (e esquecidos) aqui.
# =============================================================================

import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.normpath(
    os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
)
MARCA = "scripts/conversa-reabrir.py"
IRMA = 'path: "/whatsapp/:id/resolve",'
NOVA = 'path: "/whatsapp/:id/reopen",'

HANDLER = r"""async function handler(ctx) {
  // scripts/conversa-reabrir.py — reabrir conversa concluída (PRD 06b)
  //
  // Os três ajudantes abaixo e o par de predicados são CÓPIA do
  // POST /whatsapp/inbound. É quem escolhe a conversa aberta de um contato
  // quando a mensagem chega; se a comparação daqui divergisse da de lá, esta
  // guarda liberaria justamente o caso que a entrada vai confundir.
  function _phoneDigits(s) {
    return String(s || "").replace(/\D/g, "");
  }
  function _phoneTail(s) {
    var d = _phoneDigits(s);
    if (d.length < 10) return "";
    return d.slice(-11);
  }
  function _ehLidSalvo(v) {
    var s = String(v || "");
    return /@lid$/i.test(s) || _phoneDigits(s).length > 13;
  }

  var m = model(ctx);
  if (!m.Conv) return fail(ctx, 500, "Model WhatsAppConversation missing");
  var id = ctx.params.id;
  var conv = await m.Conv.findById(id);
  var _barrado = await _barrarPorConta(ctx, conv);
  if (_barrado) return _barrado;
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");

  // "Concluídas" é derivada dos DOIS campos, como na tela (isConcluida, em
  // app/lib/.../conversation-filters.ts). Conversa aberta não se reabre.
  var _fechada = String(conv.status || "open") === "closed"
    || String(conv.phase || "") === "resolvido";
  if (!_fechada) return fail(ctx, 409, "Esta conversa não está concluída");

  // Duas conversas abertas do mesmo contato: a entrada escolhe a PRIMEIRA que
  // o predicado casa, sem critério de desempate, e as mensagens do cliente
  // passariam a cair numa delas ao acaso. Depois de 7 dias fechada a entrada
  // abre uma nova, então este caso acontece na vida real.
  var _phone = String(conv.remote_jid || conv.remoteJid || "");
  var _ehGrupo = /@g\.us$/i.test(_phone);
  var _semTelefone = !_ehGrupo && _ehLidSalvo(_phone);
  var _dig = _semTelefone ? "" : _phoneDigits(_phone);
  var _lid = _ehGrupo ? "" : _phoneDigits(conv.remote_lid || conv.remoteLid || "");
  if (_semTelefone && !_lid) _lid = _phoneDigits(_phone);

  function _abertaPorTelefone(c) {
    if (_ehGrupo) return String(c.remote_jid || c.remoteJid || "") === _phone;
    if (!_dig) return false;
    var rj = String(c.remote_jid || c.remoteJid || "");
    if (_ehLidSalvo(rj)) return false;
    return rj === _phone || _phoneDigits(rj) === _dig || _phoneTail(rj) === _phoneTail(_phone);
  }
  function _abertaPorLid(c) {
    if (!_lid) return false;
    if (_phoneDigits(c.remote_lid || c.remoteLid) === _lid) return true;
    var rj = String(c.remote_jid || c.remoteJid || "");
    return _ehLidSalvo(rj) && _phoneDigits(rj) === _lid;
  }

  // A leitura é SEM filtro e a decisão é em memória, igual à da entrada
  // (POST /whatsapp/inbound: `findMany({})` e depois
  // `String(c.status || "open") !== "closed"`). Filtrar por `status: "open"` na
  // plataforma seria igualdade estrita: linha sem o campo `status` não voltaria,
  // e é justamente ela que a entrada conta como aberta — a guarda liberaria a
  // conversa que a entrada vai confundir. Quem barra tem de ler como quem casa.
  var _todas = (await m.Conv.findMany({})) || [];
  // Teto da plataforma: 500 por leitura, sem paginar. Cheio, esta lista pode
  // estar cortada, e a duplicata pode ser justamente a que ficou de fora —
  // leitura que não prova nada não autoriza gravar.
  if (_todas.length >= 500) {
    return fail(ctx, 503, "Não foi possível conferir se há outra conversa aberta deste contato. Tente de novo.");
  }
  var _abertas = _todas.filter(function (c) {
    return String(c.status || "open") !== "closed";
  });
  var _outra = null;
  for (var _i = 0; _i < _abertas.length && !_outra; _i++) {
    var _c = _abertas[_i];
    if (String(_c.id) === String(id)) continue;
    if (_abertaPorTelefone(_c) || _abertaPorLid(_c)) _outra = _c;
  }
  if (_outra) {
    return fail(ctx, 409, "Este contato já tem uma conversa aberta (" + String(_outra.id) + ")");
  }

  // Espelha o que a entrada já faz ao reabrir, menos o que é só de mensagem
  // recebida. Os dois campos saem juntos: limpar só o status deixaria a
  // conversa aberta e ainda presa na aba Concluídas.
  //
  // Quem reabre é quem vai falar com o cliente, então fica com ela. Grupo não
  // tem dono, e a fase acompanha o dono, como na entrada: sem dono, "novo".
  // Quem chamou pode vir só pela sessão do portal (JWT expirado): `userId`
  // sozinho devolveria null e a conversa cairia na fila sem dono, em vez de
  // ir para "Minhas" de quem reabriu.
  var _quem = userId(ctx) || (await _sessaoDoPortal(ctx));
  var _eu = _ehGrupo ? null : (_quem || null);
  var patch = {
    status: "open",
    phase: _eu ? "em_atendimento" : "novo",
    assigned_to_id: _eu,
    resolved_at: null,
    close_reason_id: null,
    menu_node: null,
    updated_at: nowIso(),
  };
  // `ticket_id` não é tocado: a conversa reaberta volta com o chamado que já
  // tinha, que é o ponto do pedido.
  await m.Conv.update(id, patch);

  if (m.Event) {
    await m.Event.create({
      id: uid("wae"),
      conversation_id: id,
      type: "reopened",
      from_value: "closed",
      to_value: "open",
      actor_id: _quem,
      note: "reaberta pelo atendente",
      created_at: nowIso(),
    });
  }

  return ok(ctx, { ok: true });
}"""


def _fonte_da_irma(text):
    """Devolve (fonte_decodificado, inicio, fim) do literal da rota /resolve."""
    pos = text.find(IRMA)
    if pos < 0:
        print("! rota /whatsapp/:id/resolve não encontrada — nada feito")
        sys.exit(1)
    ini = text.find("handler: compileController(", pos)
    if ini < 0:
        print("! handler da rota irmã não encontrado — nada feito")
        sys.exit(1)
    fim = text.find("\n", ini)
    linha = text[ini:fim]
    lit = linha[len("handler: compileController("):].rstrip().rstrip(",")
    if not lit.endswith(")"):
        print("! literal da rota irmã em formato inesperado — nada feito")
        sys.exit(1)
    return json.loads(lit[:-1])


def _trocar_handler(fonte):
    """Troca SÓ o corpo de `async function handler`, casando as chaves."""
    marca = "async function handler(ctx) {"
    ini = fonte.find(marca)
    if ini < 0:
        print("! `async function handler` não achado no fonte da irmã — nada feito")
        sys.exit(1)
    if fonte.count(marca) != 1:
        print("! mais de um `async function handler` no fonte da irmã — nada feito")
        sys.exit(1)
    nivel = 0
    i = ini + len(marca) - 1
    fim = -1
    while i < len(fonte):
        if fonte[i] == "{":
            nivel += 1
        elif fonte[i] == "}":
            nivel -= 1
            if nivel == 0:
                fim = i + 1
                break
        i += 1
    if fim < 0:
        print("! chave do handler da irmã não fecha — nada feito")
        sys.exit(1)
    return fonte[:ini] + HANDLER + fonte[fim:]


def sync_routes():
    text = open(ROUTES, encoding="utf-8").read()
    if NOVA in text:
        print("= rota /whatsapp/:id/reopen já presente")
        return
    fonte = _trocar_handler(_fonte_da_irma(text))
    esc = json.dumps(fonte, ensure_ascii=False)
    bloco = (
        '  // whatsapp POST /whatsapp/:id/reopen (' + MARCA + ')\n'
        '  {\n'
        '    module: "whatsapp",\n'
        '    method: "POST",\n'
        '    ' + NOVA + '\n'
        '    authMode: "actor",\n'
        '    webhookSecretName: null,\n'
        '    requiredPermissions: [],\n'
        '    source: "local-scripts/conversa-reabrir.py",\n'
        '    handler: compileController(' + esc + '),\n'
        '  },\n'
    )
    # Entra logo DEPOIS do bloco da irmã: a âncora é o fecho dele.
    pos = text.find(IRMA)
    fecho = text.find("\n  },\n", pos)
    if fecho < 0:
        print("! fim do bloco da rota irmã não encontrado — nada feito")
        sys.exit(1)
    corte = fecho + len("\n  },\n")
    text = text[:corte] + bloco + text[corte:]
    open(ROUTES, "w", encoding="utf-8").write(text)
    print("✓ POST /whatsapp/:id/reopen em routes.generated.ts")


if __name__ == "__main__":
    if "--sync-routes" in sys.argv:
        sync_routes()
    else:
        print("Use --sync-routes")
