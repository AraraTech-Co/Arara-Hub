// =============================================================================
// Anexar arquivo a um chamado.
//
// Existe porque quatro telas mandavam `multipart/form-data` para
// `POST /upload` — que é um stub devolvendo **501**. Anexar nunca funcionou em
// lugar nenhum do portal, e o operador via o erro cru da plataforma na tela.
//
// A rota que funciona é `POST /tickets/:id/attachments`, que recebe o conteúdo
// em base64 e guarda como `data:` URL no próprio registro. Isso limita o que
// dá para aceitar, e os limites abaixo são os do servidor — não estimativas:
//
//   tipos    imagem, vídeo, áudio, PDF, planilha, documento, texto e XML.
//            O controller recusa o resto — esta lista é ESPELHO da dele
//            (scripts/anexos-tipos-documento.py), não uma segunda verdade.
//   tamanho  10 MB por arquivo, MEDIDO no servidor a partir do conteúdo —
//            o tamanho que a tela declara não vale. Em base64 o conteúdo cresce
//            ~33%, e ele mora dentro do próprio registro.
//   scripts  .sql, .sh, .py etc. entram pela extensão e são gravados como
//            application/octet-stream: o navegador só baixa, nunca interpreta.
//
// A tela prometia "qualquer arquivo até 500 MB". Prometer menos e cumprir é
// melhor que prometer 500 MB e falhar sempre.
// =============================================================================

import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

export const ANEXO_MAX_MB = 10
const MAX_BYTES = ANEXO_MAX_MB * 1024 * 1024

export const ANEXO_TIPOS = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a',
  'application/pdf',
  // Planilha, documento, texto e XML — metade da evidência deste suporte não é
  // print. Macro (xlsm/docm), SVG/HTML e zip ficam de fora de propósito: macro
  // roda na máquina de quem abre, SVG/HTML são texto que o navegador executa
  // (e o anexo volta como `data:` URL), e zip esconde o tipo real.
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/xml', 'application/xml',
]

/** `.jfif` sai do Windows sem tipo declarado; é JPEG. */
const POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  m4a: 'audio/mp4', pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain', log: 'text/plain', xml: 'text/xml',
}

/**
 * Script e arquivo técnico (onda 2, 14/09/2026). Espelho da lista `TECNICOS`
 * do controller: aceitos pela extensão e sempre gravados como
 * `application/octet-stream`.
 */
export const ANEXO_EXTENSOES_TECNICAS = [
  'sql', 'sh', 'bash', 'py', 'js', 'ts', 'ps1', 'bat', 'cmd', 'json', 'yaml', 'yml',
  'ini', 'conf', 'cfg', 'properties', 'java', 'cs', 'php', 'rb', 'go', 'md',
] as const

function extensaoDe(file: File): string {
  return (file.name.split('.').pop() ?? '').toLowerCase()
}

export function ehArquivoTecnico(file: File): boolean {
  return (ANEXO_EXTENSOES_TECNICAS as readonly string[]).includes(extensaoDe(file))
}

/** Valor do `accept` de todo input de arquivo que sobe anexo. */
export const ANEXO_ACCEPT = [...ANEXO_TIPOS, ...ANEXO_EXTENSOES_TECNICAS.map((e) => `.${e}`)].join(',')

/** Motivo da recusa em frase para o operador, ou `null` se o arquivo pode subir. */
export function motivoRecusaAnexo(file: File): string | null {
  if (!ehArquivoTecnico(file) && !ANEXO_TIPOS.includes(tipoDoArquivo(file))) {
    return 'tipo não aceito — envie imagem, vídeo, áudio, PDF, planilha, documento, texto, XML ou script'
  }
  if (file.size > MAX_BYTES) return `máx. ${ANEXO_MAX_MB} MB`
  return null
}

export function tipoDoArquivo(file: File): string {
  if (ehArquivoTecnico(file)) return 'application/octet-stream'
  if (file.type && ANEXO_TIPOS.includes(file.type)) return file.type
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  return POR_EXTENSAO[ext] ?? file.type ?? ''
}

/** Conteúdo do arquivo como `data:` URI — a forma que a Avisa aceita no envio. */
export async function lerDataUri(file: File): Promise<string> {
  return `data:${tipoDoArquivo(file)};base64,${await lerBase64(file)}`
}

function lerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo'))
    r.onload = () => {
      const s = String(r.result ?? '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.readAsDataURL(file)
  })
}

export type AnexoCriado = {
  id: string
  fileName: string
  fileUrl: string
  fileSize: number
  fileType: string
  createdAt: string
}

/**
 * Envia um arquivo. Devolve o registro criado, ou lança com uma frase que dá
 * para mostrar ao operador — sem código de erro e sem jargão da plataforma.
 */
export async function anexarAoChamado(ticketId: string, file: File): Promise<AnexoCriado> {
  const tipo = tipoDoArquivo(file)
  // Recusa aqui, com o motivo certo, em vez de deixar o servidor recusar com
  // uma frase genérica depois de o navegador ler o arquivo inteiro.
  const recusa = motivoRecusaAnexo(file)
  if (recusa) throw new Error(recusa)

  const res = await araraApiFetch(`/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: file.name,
      file_type: tipo,
      file_size: file.size,
      content_base64: await lerBase64(file),
    }),
  })
  const j = await res.json().catch(() => null)
  if (!res.ok) throw new Error(j?.error || 'falha ao anexar')
  return j.data as AnexoCriado
}
