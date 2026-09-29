#!/usr/bin/env python3
# GET /attachments/:id/blob — serve data: anexos; legado /uploads/ → 410.
# Sync local: python3 scripts/anexos-blob-rota.py --sync-routes
# =============================================================================

import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.normpath(
    os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
)
MARCA = "scripts/anexos-blob-rota.py"

HANDLER = r"""
async function handler(ctx) {
  const Att = ctx.models.Attachment;
  if (!Att) return ctx.reply.status(500).send({ error: "Model Attachment missing" });
  const row = await Att.findById(ctx.params.id);
  if (!row) return ctx.reply.status(404).send({ error: "Anexo não encontrado" });
  var url = String(row.file_url || row.fileUrl || "");
  if (url.indexOf("data:") === 0) {
    var m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return ctx.reply.status(400).send({ error: "Conteúdo inválido" });
    var buf = Buffer.from(m[2], "base64");
    return ctx.reply.header("Content-Type", m[1]).header("Cache-Control", "private, max-age=3600").send(buf);
  }
  if (url.indexOf("/uploads/") === 0) {
    return ctx.reply.status(410).send({
      error: "Arquivo do sistema antigo — conteúdo indisponível neste ambiente.",
    });
  }
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) {
    return ctx.reply.redirect(url);
  }
  return ctx.reply.status(404).send({ error: "URL de anexo não suportada" });
}
module.exports = { handler };
""".strip()


def sync_routes():
    text = open(ROUTES, encoding="utf-8").read()
    if MARCA in text and 'path: "/attachments/:id/blob"' in text:
        print("= rota blob já presente")
        return
    esc = json.dumps(HANDLER)
    insert = f"""
  // blob anexo ({MARCA})
  {{
    method: "GET",
    path: "/attachments/:id/blob",
    authMode: "required",
    requiredPermissions: [],
    handler: compileController({esc}),
  }},
"""
    anchor = 'path: "/attachments/:id",'
    pos = text.rfind(anchor)
    if pos < 0:
        print("! anchor não encontrado")
        sys.exit(1)
    # insert before last attachments/:id route block — find preceding "  {"
    bloco = text.rfind("\n  {", 0, pos)
    text = text[:bloco] + insert + text[bloco:]
    open(ROUTES, "w", encoding="utf-8").write(text)
    print("✓ GET /attachments/:id/blob em routes.generated.ts")


if __name__ == "__main__":
    if "--sync-routes" in sys.argv:
        sync_routes()
    else:
        print("Use --sync-routes")
