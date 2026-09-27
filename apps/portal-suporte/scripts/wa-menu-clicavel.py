#!/usr/bin/env python3
# =============================================================================
# Menu CLICÁVEL no WhatsApp — lista interativa em vez de "digite o número".
#
# A Avisa não documenta a API, então perguntei à própria (veja
# scripts/avisa-sondar-acoes.py): `POST /api/actions/sendButtons` não existe,
# mas **`sendList` existe** e o contrato, descoberto pelas mensagens de
# validação, é:
#
#   { number, buttontext, desc, list: [ { title, rows: [ { title, description, rowId } ] } ] }
#
# É a lista interativa do WhatsApp: o cliente vê um botão ("Ver opções"), toca
# e escolhe numa lista — sem digitar nada. É o mesmo recurso que o BotConversa
# usa.
#
# ── Três detalhes que decidem se isso funciona ou vira bagunça ───────────────
#
#   Limite de 24 caracteres no título da linha. Metade das nossas opções passa
#   disso ("Estou com problemas na parte de pagamento, TEF/Skytef/Sitef não
#   está passando" tem 76). O título leva o começo, cortado em espaço, e o
#   texto inteiro vai na descrição — que aceita 72. Nada de cortar no meio da
#   palavra.
#
#   Máximo de 10 linhas por lista. Nosso maior menu tem 7, mas o motor divide
#   em seções e corta no limite em vez de deixar a Avisa recusar a mensagem
#   inteira.
#
#   A resposta do toque NÃO é o texto da opção: chega o `rowId`. Por isso o
#   `rowId` passa a ser o id da opção e o casamento tenta o id ANTES do texto.
#   Sem isso, o cliente toca e o bot responde "não entendi" — que é a pior
#   forma possível de estrear a novidade.
#
# ── Reserva ──────────────────────────────────────────────────────────────────
# Se o `sendList` falhar (qualquer HTTP >= 300), o motor manda o menu numerado
# de sempre. Aparelho antigo e WhatsApp Web têm histórico de não renderizar
# lista; ficar sem menu nenhum seria pior que o menu feio.
#
#   python3 scripts/wa-menu-clicavel.py            # simula
#   python3 scripts/wa-menu-clicavel.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-menu-clicavel.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/whatsapp"

# ── 1. Envio da lista ────────────────────────────────────────────────────────
VELHO_ENVIO = """  // ── Horário comercial (America/Sao_Paulo, sem depender do fuso do host) ───"""

NOVO_ENVIO = """  /** Corta no espaço mais próximo, para não partir palavra ao meio. */
  function _cortar(texto, limite) {
    var t = String(texto || "").trim();
    if (t.length <= limite) return t;
    var pedaco = t.slice(0, limite - 1);
    var espaco = pedaco.lastIndexOf(" ");
    if (espaco > limite * 0.6) pedaco = pedaco.slice(0, espaco);
    return pedaco + "…";
  }

  /**
   * Menu CLICÁVEL — lista interativa da Avisa (`sendList`). Ver %s.
   * Devolve true se a lista saiu; false manda o chamador cair no menu
   * numerado, que é a reserva para aparelho que não renderiza lista.
   */
  async function _dizerLista(pergunta, opcoes) {
    if (!token || enviadas >= 4 || !opcoes || !opcoes.length) return false;
    var numero = String(conv.remote_jid || "").replace(/[^0-9]/g, "");
    if (numero.length <= 11) numero = "55" + numero;

    // Teto de 10 linhas é do WhatsApp; passar disso faz a mensagem inteira ser
    // recusada, então cortamos aqui, conscientemente.
    var linhas = [];
    for (var i = 0; i < opcoes.length && i < 10; i++) {
      linhas.push({
        title: _cortar(opcoes[i].label, 24),
        description: _cortar(opcoes[i].label, 72),
        rowId: String(opcoes[i].id),
      });
    }
    try {
      var r = await ctx.fetch("https://www.avisaapi.com.br/api/actions/sendList", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          number: numero,
          desc: String(pergunta || "").slice(0, 1024),
          buttontext: "Ver opções",
          list: [{ title: "Opções", rows: linhas }],
        }),
      });
      if (!r || r.status >= 300) return false;
    } catch (e) { return false; }

    enviadas++;
    // Grava o que o cliente viu, em texto, para o atendente entender a
    // conversa depois — a lista não aparece sozinha no histórico.
    try {
      if (Msg) {
        var resumo = [pergunta];
        for (var k = 0; k < linhas.length; k++) resumo.push("• " + opcoes[k].label);
        await Msg.create({
          id: "wam_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          conversation_id: conv.id,
          message_id: "bot_" + Date.now(),
          from_me: true,
          sender_name: "Atendimento automático",
          body: resumo.join("\\n"),
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) {}
    return true;
  }

  // ── Horário comercial (America/Sao_Paulo, sem depender do fuso do host) ───"""

# ── 2. Menu usa a lista, com reserva no numerado ─────────────────────────────
VELHO_MENU = """      if (tipo === "menu") {
        await _dizer(_textoDoMenu(no));"""

NOVO_MENU = """      if (tipo === "menu") {
        // Primeiro a lista clicável; se a Avisa recusar, o menu numerado.
        var saiuLista = await _dizerLista(no.data.text, no.data.options || []);
        if (!saiuLista) await _dizer(_textoDoMenu(no));"""

# ── 3. Casar o toque (rowId) antes do texto ──────────────────────────────────
VELHO_ESCOLHA = """  function _escolher(no, resposta) {
    var ops = no.data.options || [];
    var cru = String(resposta || "").trim();"""

NOVO_ESCOLHA = """  function _escolher(no, resposta) {
    var ops = no.data.options || [];
    var cru = String(resposta || "").trim();

    // Toque na lista chega como `rowId`, não como o texto da opção. Testar o
    // id ANTES do resto evita o "não entendi" logo no primeiro toque. Ver %s.
    for (var r = 0; r < ops.length; r++) {
      if (String(ops[r].id) === cru) return ops[r];
    }""" % MARCA

# ── 4. Repetição do menu quando não entende ──────────────────────────────────
VELHO_REPETE = """    await _dizer("Não entendi. " + _textoDoMenu(atual));"""
NOVO_REPETE = """    var repetiu = await _dizerLista("Não entendi. " + (atual.data.text || ""), atual.data.options || []);
    if (!repetiu) await _dizer("Não entendi. " + _textoDoMenu(atual));"""


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/inbound"][0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= já aplicado")
        return

    trocas = [
        (VELHO_ENVIO, NOVO_ENVIO % MARCA),
        (VELHO_MENU, NOVO_MENU),
        (VELHO_ESCOLHA, NOVO_ESCOLHA),
        (VELHO_REPETE, NOVO_REPETE),
    ]
    novo = codigo
    for velho, troca in trocas:
        if novo.count(velho) != 1:
            print(f"! âncora aparece {novo.count(velho)}x; revise o script")
            sys.exit(1)
        novo = novo.replace(velho, troca, 1)

    open("/tmp/inbound_lista.js", "w").write(novo)
    print(f"→ inbound: {len(codigo)} → {len(novo)} caracteres (cópia em /tmp/inbound_lista.js)")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return

    corpo = {"method": "POST", "path": "/whatsapp/inbound", "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ gravar: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
