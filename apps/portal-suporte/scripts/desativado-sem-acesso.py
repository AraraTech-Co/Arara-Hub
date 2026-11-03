#!/usr/bin/env python3
# =============================================================================
# Membro desativado não passa de rota nenhuma do portal.
#
# Desativar (`POST /admin/membros/:id/ativacao`) grava `active: false` no
# Profile. Este script faz as rotas respeitarem isso, em dois lugares:
#
#   1. A GUARDA DE SESSÃO carimbada pelo scripts/guarda-sessao.py. `_gsEuSou`
#      já lê o Profile de quem chama; passa a devolver também `desativado`, e
#      `_gsComSessao` recusa com 403 antes do corpo da rota. Nenhuma leitura a
#      mais. O `GUARDA` daquele script foi atualizado junto, para rota nova
#      nascer com a mesma regra.
#
#   2. As rotas ESCRITAS À MÃO que identificam pessoa (`ctx.user` ou
#      `x-portal-sessao`) e não têm a guarda carimbada. Cada uma resolve a
#      identidade do seu jeito, então em vez de mexer em vinte funções
#      diferentes a barreira `_dsBarra` vai NA FRENTE do handler exportado. Ela
#      só recusa: quando não há pessoa, ou a pessoa está ativa, entrega para o
#      handler de sempre.
#
# `active` ausente conta como ativo — cadastro antigo não perde o acesso por
# omissão. Só `false` literal desativa.
#
# Edita o routes.generated.ts do repositório; o deploy é o merge. Não fala com
# a plataforma e não usa chave nenhuma.
#
#   python3 scripts/desativado-sem-acesso.py            # simula
#   python3 scripts/desativado-sem-acesso.py --gravar   # grava no arquivo
#
# Aborta sem gravar nada se qualquer âncora não estiver no formato esperado.
# =============================================================================

import argparse
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")

RE_ENTRADA = re.compile(
    r'\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)')
EXPORTS = re.compile(r"module\.exports\s*=\s*\{\s*handler(?:\s*:\s*([A-Za-z0-9_$]+))?\s*\}\s*;?")

MARCA_DS = "scripts/desativado-sem-acesso.py"

# ── 1. A guarda carimbada ────────────────────────────────────────────────────
# O comentário de cabeçalho da guarda é reescrito junto: ele passa a dizer só a
# regra que vale.
GS_COMENTARIO_ANTIGO = (
    "// Nada responde sem pessoa identificada. A identidade vem do JWT (`ctx.user`)\n"
    "// ou da sessão do portal (`x-portal-sessao`); sem nenhuma das duas, 401.\n"
    "//\n"
    "// O desenho anterior tratava \"sem pessoa\" como chamada de serviço e liberava\n"
    "// tudo. Como a chave de API de app não carrega pessoa, qualquer credencial\n"
    "// aceita pelo app — inclusive a de um cliente — passava por cima do nível.\n"
)
GS_COMENTARIO_NOVO = (
    "// Nada responde sem pessoa identificada. A identidade vem do JWT (`ctx.user`)\n"
    "// ou da sessão do portal (`x-portal-sessao`); sem nenhuma das duas, 401.\n"
    "// Chave de API de app não carrega pessoa, então não identifica ninguém.\n"
    "// Membro desativado (`active: false` no Profile) recebe 403 em toda rota.\n"
)
GS_RETORNO_ANTIGO = '  return { id: quem, nivel: _gsRANK[_gsCanonico(p ? p.role : "")] || 0 };\n'
GS_RETORNO_NOVO = (
    '  return {\n'
    '    id: quem,\n'
    '    nivel: _gsRANK[_gsCanonico(p ? p.role : "")] || 0,\n'
    '    // Só `false` literal desativa: cadastro sem o campo é de antes dele existir.\n'
    '    desativado: !!(p && p.active === false),\n'
    '  };\n'
)
GS_RECUSA_ANTIGO = (
    '    return ctx.reply.status(401).send({ success: false, error: "Requer sessão do portal" });\n'
    '  }\n'
    '  if (eu.nivel < _gsRANK['
)
GS_RECUSA_NOVO = (
    '    return ctx.reply.status(401).send({ success: false, error: "Requer sessão do portal" });\n'
    '  }\n'
    '  if (eu.desativado) {\n'
    '    return ctx.reply.status(403).send({ success: false, error: "Acesso desativado", desativado: true });\n'
    '  }\n'
    '  if (eu.nivel < _gsRANK['
)

# ── 2. A barreira das rotas escritas à mão ───────────────────────────────────
# Rotas que identificam pessoa mas têm de continuar abertas a quem foi
# desativado. Uma só: sair do portal tem de funcionar para todo mundo.
FICA_ABERTA = {
    ("POST", "/auth/sessao/encerrar"): "sair tem de funcionar para quem foi desativado",
}

BARREIRA = '''
// ── Barreira do desativado (%(marca)s) ──
// Membro desativado (`active: false` no Profile) recebe 403 antes desta rota
// rodar. Sem pessoa identificada, ou com pessoa ativa, a rota segue como era:
// a barreira só recusa, nunca concede.
//
// Ler o Profile falhou: 503, nem passa nem derruba. 401/403 a tela entende
// como sessão encerrada, e um soluço de rede deslogaria quem está ativo.
async function _dsQuem(ctx) {
  var u = ctx.user || {};
  if (u.id || u.userId) return u.id || u.userId;
  try {
    var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || "";
    var partes = String(h).split(".");
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    var S = ctx.models && ctx.models.Sessao;
    if (!S) return null;
    var linha = await S.findById("ses_" + partes[0]);
    if (!linha || linha.revogada === true) return null;
    if (String(linha.verificador || "") !== partes[1]) return null;
    if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;
    return linha.user_id || null;
  } catch (e) { return null; }
}
var _dsOriginal = %(anterior)s;
async function _dsBarra(ctx) {
  var quem = await _dsQuem(ctx);
  if (quem && ctx.models && ctx.models.Profile) {
    var p;
    try {
      p = await ctx.models.Profile.findById(quem);
    } catch (e) {
      return ctx.reply.status(503).send({ success: false, error: "Não foi possível conferir o acesso" });
    }
    if (p && p.active === false) {
      return ctx.reply.status(403).send({ success: false, error: "Acesso desativado", desativado: true });
    }
  }
  return _dsOriginal(ctx);
}
module.exports = { handler: _dsBarra };
'''


def codifica(texto, ascii_):
    """O literal como o arquivo o guarda: há literais com acento escapado
    (\\u00e3) e literais com UTF-8 cru. Cada trecho novo é codificado no estilo
    do literal em que entra, para a diff mostrar só o que mudou."""
    return json.dumps(texto, ensure_ascii=ascii_)[1:-1]


def troca_codificada(enc, de, para, ascii_):
    # Há literal com os DOIS estilos (o corpo escapado e a guarda, colada
    # depois, em UTF-8 cru). Tenta o estilo do literal primeiro e o outro em
    # seguida; o trecho novo sai no estilo em que a âncora foi achada.
    for estilo in (ascii_, not ascii_):
        a = codifica(de, estilo)
        if enc.count(a) == 1:
            return enc.replace(a, codifica(para, estilo))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args()

    texto = open(ARQ, encoding="utf-8").read()
    pedacos, fim = [], 0
    guardas = barreiras = ja = 0
    erros = []

    for m in RE_ENTRADA.finditer(texto):
        meta, enc = m.group(1), m.group(2)
        metodo = (re.search(r'method:\s*"([^"]+)"', meta) or [None, "?"])[1]
        caminho = (re.search(r'path:\s*"([^"]+)"', meta) or [None, "?"])[1]
        chave = f"{metodo} {caminho}"
        codigo = json.loads('"' + enc + '"')
        ascii_ = "\\u00" in enc or "\\u2" in enc
        novo = None

        if "_gsEuSou" in codigo:
            if "desativado: !!(p && p.active === false)" in codigo:
                ja += 1
            else:
                novo = enc
                for de, para in ((GS_COMENTARIO_ANTIGO, GS_COMENTARIO_NOVO),
                                 (GS_RETORNO_ANTIGO, GS_RETORNO_NOVO),
                                 (GS_RECUSA_ANTIGO, GS_RECUSA_NOVO)):
                    novo = troca_codificada(novo, de, para, ascii_) if novo is not None else None
                if novo is None:
                    erros.append(f"{chave}: a guarda não está no formato esperado")
                else:
                    guardas += 1
        elif ("ctx.user" in codigo or "x-portal-sessao" in codigo) and (metodo, caminho) not in FICA_ABERTA:
            if MARCA_DS in codigo:
                ja += 1
            else:
                achados = list(EXPORTS.finditer(codigo))
                if not achados:
                    erros.append(f"{chave}: sem module.exports reconhecível")
                else:
                    ultimo = achados[-1]
                    anterior = ultimo.group(1) or "handler"
                    bloco = BARREIRA % {"marca": MARCA_DS, "anterior": anterior}
                    # O module.exports original é trocado pelo bloco, que exporta a
                    # barreira. Trocar no texto codificado, como a guarda acima.
                    novo = troca_codificada(enc, ultimo.group(0), bloco.strip("\n") + "\n", ascii_)
                    if novo is None:
                        erros.append(f"{chave}: module.exports não é único no literal")
                    else:
                        barreiras += 1
                        print(f"   barreira  {chave}")

        if novo is not None:
            # A prova de que a edição no texto codificado é a edição pretendida:
            # o literal novo decodifica, e o que mudou é só o que este script pôs.
            json.loads('"' + novo + '"')
            pedacos.append(texto[fim:m.start(2)])
            pedacos.append(novo)
            fim = m.end(2)

    pedacos.append(texto[fim:])
    saida = "".join(pedacos)

    print(f"\n   {guardas} guarda(s) carimbada(s) atualizadas · {barreiras} barreira(s) nova(s) · {ja} já tinham a regra")
    if erros:
        print("\n❌ nada foi gravado:")
        for e in erros:
            print("   " + e)
        sys.exit(1)
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    open(ARQ, "w", encoding="utf-8").write(saida)
    print("   gravado")


if __name__ == "__main__":
    main()
