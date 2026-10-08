#!/usr/bin/env python3
# =============================================================================
# Repõe o conteúdo dos anexos antigos dentro do próprio registro.
#
# O problema: 151 dos 176 anexos guardam `file_url` como `/uploads/<uuid>.ext`,
# caminho do deploy Prisma que gravava em disco. A hospedagem estática atual não
# serve esse caminho — `GET /uploads/x.jfif` devolve 200 com o index.html do
# portal, o <img> recebe HTML e o navegador pinta o ícone de arquivo quebrado.
#
# Os bytes de 104 desses arquivos ainda existem: o container antigo
# (`portal-suporte-prd`) continua no ar servindo `:3000/uploads/...`. Os outros
# 47 sumiram em redeploys anteriores — `public/uploads` nunca teve volume.
#
# A reposição grava o conteúdo como `data:` URL no registro, igual aos 25
# anexos criados pela API atual. Assim o anexo só sai pela API autenticada;
# ninguém baixa por URL solta, que é o motivo de a API nova ter abandonado o
# disco público.
#
#   python3 scripts/anexos-rehidratar.py --criar-rota   # cria e publica a rota
#   python3 scripts/anexos-rehidratar.py                # simula (não escreve)
#   python3 scripts/anexos-rehidratar.py --aplicar      # repõe
#   python3 scripts/anexos-rehidratar.py --verificar    # confere o resultado
#
# Idempotente: a rota recusa sobrescrever anexo que já tem conteúdo embutido,
# então rodar duas vezes não corrompe nada nem duplica trabalho.
# =============================================================================

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Container antigo, ainda de pé, servindo o que sobrou de public/uploads.
# O endereço vem do ambiente: este repositório é público, e endereço de
# servidor interno não entra em código aberto.
ORIGEM = os.environ.get("ANEXOS_ORIGEM", "").rstrip("/")


def exigir_origem():
    if not ORIGEM:
        raise SystemExit(
            "Defina ANEXOS_ORIGEM com a URL do container antigo, ex.:\n"
            "  ANEXOS_ORIGEM=http://servidor:3000 python3 scripts/anexos-rehidratar.py"
        )


def env():
    caminho = os.path.join(RAIZ, ".env.local")
    if not os.path.isfile(caminho):
        sys.exit("❌ .env.local não encontrado")
    vals = {}
    with open(caminho) as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                vals[k.strip()] = v.strip().strip('"').strip("'")
    api = vals.get("NEXT_PUBLIC_ARARA_API_URL")
    key = vals.get("ARARA_API_KEY")
    if not api or not key:
        sys.exit("❌ defina NEXT_PUBLIC_ARARA_API_URL e ARARA_API_KEY em .env.local")
    return api, key


API, KEY = env()
APP = f"{API}/v1/apps/portal-suporte"
RT = f"{API}/v1/r/portal-suporte"


def req(url, metodo="GET", dados=None, timeout=120, bruto=False):
    corpo = None
    cab = {"x-api-key": KEY}
    if dados is not None:
        corpo = json.dumps(dados).encode()
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            conteudo = resp.read()
            return resp.status, (conteudo if bruto else json.loads(conteudo or b"{}"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


# ── A rota ───────────────────────────────────────────────────────────────────
# Rota de reposição, não de edição: só aceita `data:` e só age sobre anexo que
# ainda aponta para o disco antigo. Um PATCH genérico em anexo seria uma via
# para trocar a evidência de um chamado sem deixar rastro.
CONTROLLER = r"""
async function handler(ctx) {
  const Att = ctx.models.Attachment;
  if (!Att) return ctx.reply.status(500).send({ error: "Model Attachment missing" });

  // Chave de API não carrega pessoa: chamada de serviço passa. Com JWT, exige
  // admin — repor conteúdo de evidência não é operação de atendimento.
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  if (quem && ctx.models.Profile) {
    var perfil = await ctx.models.Profile.findById(quem);
    var papel = String((perfil && perfil.role) || "").toLowerCase();
    if (papel !== "admin" && papel !== "master") {
      return ctx.reply.status(403).send({ success: false, error: "Sem permissão" });
    }
  }

  const id = ctx.params.id;
  const atual = await Att.findById(id);
  if (!atual) return ctx.reply.status(404).send({ error: "Anexo não encontrado" });

  const urlAtual = String(atual.file_url || atual.fileUrl || "");
  const body = ctx.body || {};
  const parte = body.append_base64 ? String(body.append_base64) : "";
  const novo = String(body.file_url || body.fileUrl || "");

  // Arquivo grande vem em pedaços: o primeiro traz `file_url` com o cabeçalho
  // data:, os seguintes só concatenam. Sem isso, um anexo de 860 KB estoura o
  // limite de corpo da requisição e nunca subiria.
  if (parte) {
    if (urlAtual.indexOf("data:") !== 0) {
      return ctx.reply.status(409).send({ error: "Comece enviando file_url" });
    }
    const juntado = urlAtual + parte;
    await Att.update(id, { file_url: juntado });
    return ctx.reply.send({ success: true, tamanho: juntado.length });
  }

  // Sem escape: anexo íntegro não é sobrescrito por esta rota, nem com flag.
  // Trocar a evidência de um chamado tem que doer mais do que um PATCH.
  if (urlAtual.indexOf("data:") === 0) {
    return ctx.reply.status(409).send({ error: "Anexo já tem conteúdo embutido" });
  }
  if (novo.indexOf("data:") !== 0) {
    return ctx.reply.status(400).send({ error: "file_url deve ser um data: URL" });
  }

  await Att.update(id, { file_url: novo });
  return ctx.reply.send({ success: true, id: id, tamanho: novo.length });
}
module.exports = { handler };
"""


def criar_rota():
    print("→ Escrevendo PATCH /attachments/:id no rascunho")
    c, r = req(
        f"{APP}/modules/attachments/routes",
        "PUT",
        {"method": "PATCH", "path": "/attachments/:id", "controllerCode": CONTROLLER},
    )
    print(f"   HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    print("→ Publicando o módulo attachments")
    c, r = req(f"{APP}/modules/attachments", "PATCH", {"status": "published"})
    print(f"   HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit("   a rota ficou no rascunho — publicar exige JWT?")


# ── Inventário ───────────────────────────────────────────────────────────────
def inventario():
    _, d = req(f"{RT}/tickets?limit=1000")
    ids = [t["id"] for t in d["data"]]

    def um(t):
        c, r = req(f"{RT}/tickets/{t}/attachments", timeout=60)
        return r.get("data", []) if c == 200 and isinstance(r, dict) else []

    with ThreadPoolExecutor(8) as ex:
        return [a for lote in ex.map(um, ids) for a in lote]


def baixar(caminho):
    exigir_origem()
    try:
        with urllib.request.urlopen(ORIGEM + caminho, timeout=60) as r:
            return r.read() if r.status == 200 else None
    except Exception:
        return None


def main():
    acao = sys.argv[1] if len(sys.argv) > 1 else ""

    if acao == "--criar-rota":
        criar_rota()
        return

    atts = inventario()
    antigos = [a for a in atts if str(a["fileUrl"]).startswith("/uploads/")]
    embutidos = [a for a in atts if str(a["fileUrl"]).startswith("data:")]

    if acao == "--verificar":
        print(f"anexos: {len(atts)} | com conteúdo: {len(embutidos)} | ainda em /uploads/: {len(antigos)}")
        return

    print(f"→ {len(atts)} anexos: {len(embutidos)} já íntegros, {len(antigos)} apontando para o disco antigo")
    print("→ Buscando os arquivos no container antigo")
    with ThreadPoolExecutor(10) as ex:
        conteudos = list(ex.map(lambda a: baixar(a["fileUrl"]), antigos))

    achados = [(a, b) for a, b in zip(antigos, conteudos) if b]
    perdidos = [a for a, b in zip(antigos, conteudos) if not b]
    total = sum(len(b) for _, b in achados)
    print(f"   encontrados {len(achados)} ({total/1048576:.1f} MB) · perdidos {len(perdidos)}")

    if acao != "--aplicar":
        print("\n   (simulação — use --aplicar para gravar)")
        for a, b in sorted(achados, key=lambda x: -len(x[1]))[:5]:
            print(f"     {len(b)/1024:8.0f} KB  {a['fileName'][:60]}")
        return

    # Pedaços de 512 KB de base64: cabe folgado em qualquer limite de corpo e
    # ainda resolve a maioria dos arquivos numa requisição só.
    PEDACO = 512 * 1024
    ok = falhas = 0
    for a, bytes_ in sorted(achados, key=lambda x: len(x[1])):
        b64 = base64.b64encode(bytes_).decode()
        cabecalho = f"data:{a['fileType']};base64,"
        alvo = f"{RT}/attachments/{a['id']}"
        primeiro, resto = b64[:PEDACO], b64[PEDACO:]
        c, r = req(alvo, "PATCH", {"file_url": cabecalho + primeiro})
        while c == 200 and resto:
            pedaco, resto = resto[:PEDACO], resto[PEDACO:]
            c, r = req(alvo, "PATCH", {"append_base64": pedaco})
        if c == 200:
            ok += 1
            print(f"   ✅ {a['fileName'][:50]:52} {len(bytes_)/1024:7.0f} KB")
        else:
            falhas += 1
            print(f"   ❌ {a['fileName'][:50]:52} HTTP {c} {r}")
    print(f"\n   {ok} repostos, {falhas} com falha, {len(perdidos)} sem arquivo de origem")


if __name__ == "__main__":
    main()
