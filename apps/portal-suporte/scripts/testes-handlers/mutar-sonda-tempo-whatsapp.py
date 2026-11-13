#!/usr/bin/env python3
# =============================================================================
# Mutação de sonda-tempo-whatsapp.test.js.
#
# Cada mutante mexe no literal de UMA rota (achada por método+caminho, no texto
# decodificado) e tem de morrer NA ASSERÇÃO QUE O NOMEIA; morrer em outra ou por
# exceção não conta, e âncora que não casa uma vez só é NÃO APLICOU e reprova.
#
# Roda com: python3 mutar-sonda-tempo-whatsapp.py
# =============================================================================

import json, os, re, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PS = os.path.dirname(os.path.dirname(AQUI))
ROTAS = os.path.abspath(os.path.join(PS, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts"))
T = os.path.join(AQUI, "sonda-tempo-whatsapp.test.js")
RE_ENTRADA = re.compile(
    r'\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)')
ENVIO = "POST /whatsapp"
DETALHE = "GET /whatsapp/:id"
MENSAGENS = "GET /whatsapp/:id/messages"


def no_literal(chave, trocas):
    def aplicar(texto):
        metodo, caminho = chave.split(" ", 1)
        for m in RE_ENTRADA.finditer(texto):
            met = re.search(r'method:\s*"([^"]+)"', m.group(1))
            cam = re.search(r'path:\s*"([^"]+)"', m.group(1))
            if not (met and cam and met.group(1) == metodo and cam.group(1) == caminho):
                continue
            codigo = json.loads('"' + m.group(2) + '"')
            for de, para in trocas:
                if codigo.count(de) != 1:
                    return None
                codigo = codigo.replace(de, para)
            return texto[:m.start(2)] + json.dumps(codigo)[1:-1] + texto[m.end(2):]
        return None
    return aplicar


MUTANTES = [
    ("sempre-ligada", ENVIO, [("  if (!_stLigada(t0)) return _stOriginal(ctx);\n", "")],
     "às 14:30 de Brasília não grava nada"),
    ("limite-uma-hora-mais-tarde", ENVIO, [('var _stLimite = Date.parse("2026-11-13T17:30:00Z");',
                                           'var _stLimite = Date.parse("2026-11-13T18:30:00Z");')],
     "às 14:30 de Brasília não grava nada"),
    ("limite-no-horario-de-brasilia-sem-fuso", ENVIO, [('var _stLimite = Date.parse("2026-11-13T17:30:00Z");',
                                                       'var _stLimite = Date.parse("2026-11-13T14:30:00Z");')],
     "às 14:29:59 de Brasília ainda grava"),
    ("limite-inclusivo", ENVIO, [("return agora < _stLimite;", "return agora <= _stLimite;")],
     "às 14:30 de Brasília não grava nada"),
    ("modelos-sem-medir", ENVIO, [("    models: _stMedirModelos(ctx.models, passos),\n", "")],
     "anota a leitura da conversa"),
    ("rede-sem-medir", ENVIO, [("    fetch: _stMedirFetch(ctx.fetch, redes),\n", "")],
     "anota a chamada ao provedor: caminho e HTTP"),
    ("url-inteira-em-vez-do-caminho", ENVIO, [("caminho = new URL(String(url)).pathname;", "caminho = String(url);")],
     "anota a chamada ao provedor: caminho e HTTP"),
    ("findmany-sem-campos", ENVIO, [('p.f = arg0 && typeof arg0 === "object" ? Object.keys(arg0).sort().join(",") : "";', "")],
     "findMany leva os NOMES dos campos e a contagem"),
    ("findmany-com-valores-do-filtro", ENVIO, [('Object.keys(arg0).sort().join(",")', "JSON.stringify(arg0)")],
     "filtro vai pelo nome do campo, sem o valor"),
    ("passo-que-falha-nao-marcado", ENVIO, [("            if (erro) p.erro = true;\n", "")],
     "o evento marca o passo que falhou"),
    ("nao-captura-a-resposta", ENVIO, [("send: function (v) { enviado = v; return rep.send(v); }",
                                        "send: function (v) { return rep.send(v); }")],
     "rota, HTTP, conversa e entrega"),
    ("nao-captura-o-http", ENVIO, [("status: function (c) { http = c; rep.status(c); return rep2; }",
                                    "status: function (c) { rep.status(c); return rep2; }")],
     "rota, HTTP, conversa e entrega"),
    ("resposta-alterada", ENVIO, [("send: function (v) { enviado = v; return rep.send(v); }",
                                   "send: function (v) { enviado = v; return rep.send(Object.assign({ sonda: 1 }, v)); }")],
     "resposta do envio idêntica à do handler sem sonda"),
    ("erro-de-entrega-com-numero", ENVIO, [("corpo.erro_entrega ? _stSemNumero(corpo.erro_entrega).slice(0, 160)",
                                            "corpo.erro_entrega ? String(corpo.erro_entrega).slice(0, 160)")],
     "o erro vai sem o número"),
    ("citacao-nao-marcada", ENVIO, [("      citacao: !!b.responder_a,\n", "      citacao: false,\n")],
     "envio com citação: citacao = true"),
    ("gravacao-esperada", ENVIO, [("function _stGravar(ctx, d) {", "async function _stGravar(ctx, d) {"),
                                  ("    Promise.resolve(Ev.create({", "    await Promise.resolve(Ev.create({"),
                                  ("if (Date.now() - t0 >= _stMinimoMs) _stGravar(ctx, {", "if (Date.now() - t0 >= _stMinimoMs) await _stGravar(ctx, {")],
     "evento que trava não segura a resposta"),
    ("passos-acumulam-entre-pedidos", ENVIO, [("  var passos = [];\n", ""),
                                              ("var _stOriginal = _gsComSessao;", "var _stOriginal = _gsComSessao;\nvar passos = [];")],
     "dois pedidos, passos do mesmo tamanho (nada acumula)"),
    ("sem-gravar-o-evento", ENVIO, [('      kind: "diag_tempo",\n', '      kind: "diag_outro",\n')],
     "grava UM evento diag_tempo"),
    # ── detalhe: o literal dele é próprio, e é o que se mede ──────────────────
    ("detalhe-sem-sonda-ligada", DETALHE, [("module.exports = { handler: _stComSonda };", "module.exports = { handler: _gsComSessao };")],
     "detalhe grava UM diag_tempo com rota e conversa"),
    ("detalhe-rota-errada", DETALHE, [('var _stRota = "GET /whatsapp/:id";', 'var _stRota = "POST /whatsapp";')],
     "detalhe grava UM diag_tempo com rota e conversa"),
    ("detalhe-resposta-alterada", DETALHE, [("send: function (v) { enviado = v; return rep.send(v); }",
                                             "send: function (v) { enviado = v; return rep.send(Object.assign({ sonda: 1 }, v)); }")],
     "resposta do detalhe idêntica à do handler sem sonda"),
    # ── carregar as mensagens ─────────────────────────────────────────────────
    ("mensagens-sem-sonda-ligada", MENSAGENS, [("module.exports = { handler: _stComSonda };", "module.exports = { handler: _gsComSessao };")],
     "mensagens lentas (1 s ou mais): UM diag_tempo com rota e conversa"),
    ("mensagens-resposta-alterada", MENSAGENS, [("send: function (v) { enviado = v; return rep.send(v); }",
                                               "send: function (v) { enviado = v; return rep.send(Object.assign({ sonda: 1 }, v)); }")],
     "resposta das mensagens idêntica à do handler sem sonda"),
    ("mensagens-sem-medir-modelos", MENSAGENS, [("    models: _stMedirModelos(ctx.models, passos),\n", "")],
     "anota a leitura das mensagens com o nome do filtro"),
    ("mensagens-sem-limiar", MENSAGENS, [("var _stMinimoMs = 1000;", "var _stMinimoMs = 0;")],
     "mensagens rápidas (abaixo de 1 s) não gravam nada"),
    ("mensagens-limiar-exclusivo", MENSAGENS, [("if (Date.now() - t0 >= _stMinimoMs)", "if (Date.now() - t0 > _stMinimoMs)")],
     "mensagens lentas (1 s ou mais): UM diag_tempo com rota e conversa"),
    ("mensagens-limiar-baixo", MENSAGENS, [("var _stMinimoMs = 1000;", "var _stMinimoMs = 500;")],
     "a 999 ms ainda não grava"),
    ("envio-com-limiar", ENVIO, [("var _stMinimoMs = 0;", "var _stMinimoMs = 1000;")],
     "grava UM evento diag_tempo"),
]


def main():
    original = open(ROTAS, encoding="utf-8").read()
    base = subprocess.run(["node", T], capture_output=True, text=True)
    if base.returncode != 0:
        print(base.stdout + base.stderr)
        sys.exit("❌ o teste não passa sem mutação")
    mortos = 0
    try:
        for nome, rota, trocas, assercao in MUTANTES:
            novo = no_literal(rota, trocas)(original)
            if novo is None:
                print(f"NÃO APLICOU  {nome}")
                continue
            open(ROTAS, "w", encoding="utf-8").write(novo)
            r = subprocess.run(["node", T], capture_output=True, text=True)
            linhas = [l for l in r.stdout.splitlines() if l.startswith("FALHA")]
            certo = any(l[len("FALHA"):].strip().startswith(assercao) for l in linhas)
            if r.returncode != 0 and certo:
                mortos += 1
                print(f"morreu       {nome}  ({len(linhas)} falha(s))")
            elif r.returncode != 0:
                print(f"MORREU ERRADO {nome}: {linhas[:3] or (r.stderr.strip().splitlines() or ['?'])[-1:]}")
            else:
                print(f"VIVO         {nome}")
    finally:
        open(ROTAS, "w", encoding="utf-8").write(original)
    print(f"\n{mortos}/{len(MUTANTES)} mutantes mortos na asserção certa")
    if mortos != len(MUTANTES):
        sys.exit(1)


if __name__ == "__main__":
    main()
