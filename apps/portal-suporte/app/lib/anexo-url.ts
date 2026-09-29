// Resolve URL de exibição/download para anexos (data:, blob API, legado /uploads/).

export type AnexoUrlRef = {
  id?: string | null
  fileUrl?: string | null
  file_url?: string | null
}

export function urlBrutaAnexo(anexo: AnexoUrlRef): string {
  return String(anexo.fileUrl ?? anexo.file_url ?? '')
}

/** Caminho autenticado para servir conteúdo embutido ou sinalizar legado. */
export function urlExibicaoAnexo(anexo: AnexoUrlRef): string {
  const u = urlBrutaAnexo(anexo)
  if (!u) return ''
  if (u.startsWith('data:')) return u
  if (u.startsWith('/uploads/')) {
    return anexo.id ? `/api/attachments/${anexo.id}/blob` : ''
  }
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('/api/')) return u
  return u
}

export function anexoLegadoSemConteudo(url: string): boolean {
  return url.startsWith('/uploads/')
}
