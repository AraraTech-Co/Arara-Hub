// Resolve URL de exibição/download para anexos (data:, blob API, legado /uploads/).

export type AnexoUrlRef = {
  id?: string | null
  fileUrl?: string | null
  file_url?: string | null
}

export function urlBrutaAnexo(anexo: AnexoUrlRef): string {
  return String(anexo.fileUrl ?? anexo.file_url ?? '')
}

/**
 * URL que o navegador consegue abrir direto, ou vazio quando não há nenhuma.
 *
 * Anexo legado (`/uploads/`) devolve vazio. Antes devolvia
 * `/api/attachments/<id>/blob`, que parecia uma rota autenticada e não era:
 * esse caminho fica no domínio do PORTAL, que é export estático e não tem
 * backend. Ele caía no fallback da SPA e devolvia 200 com HTML — o `<img>`
 * não decodificava, e a tela só descobria o problema pelo `onError` ou por um
 * HEAD que adivinhava "HTML onde se esperava imagem".
 *
 * O conteúdo desses arquivos também não existe mais no servidor: a rota
 * equivalente na API responde 410 para `/uploads/`. Então o honesto é dizer
 * logo que não há URL, em vez de montar uma que sempre falha
 * (TCK000675 3.5).
 */
export function urlExibicaoAnexo(anexo: AnexoUrlRef): string {
  const u = urlBrutaAnexo(anexo)
  if (!u) return ''
  if (u.startsWith('data:')) return u
  if (u.startsWith('/uploads/')) return ''
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('/api/')) return u
  return u
}

export function anexoLegadoSemConteudo(url: string): boolean {
  return url.startsWith('/uploads/')
}
