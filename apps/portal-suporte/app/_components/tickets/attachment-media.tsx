'use client'

// =============================================================================
// Miniatura de anexo que não vira "imagem quebrada" quando o arquivo sumiu.
//
// Dois formatos de `fileUrl` convivem hoje:
//
//   data:image/jpeg;base64,…   → anexos criados pela API atual; o byte vem
//                                junto do registro e sempre renderiza.
//   /uploads/<uuid>.jpg        → anexos do deploy Prisma anterior, que
//                                gravava em disco e servia por esse caminho.
//
// O segundo formato não existe mais na hospedagem estática — e o modo como ele
// falha é o pior possível: `GET /uploads/x.jfif` devolve **200 com o index.html
// do portal**, não 404. O navegador recebe HTML onde esperava JPEG, não
// decodifica, e pinta o ícone de arquivo quebrado. Foi exatamente o que
// apareceu no card de anexos.
//
// Como o erro chega por decodificação e não por status, checar `res.ok` num
// fetch não detectaria nada. O sinal confiável é o `onError` do próprio
// elemento — que também cobre data: corrompido e vídeo ilegível, sem precisar
// reconhecer formato de URL nenhum. Se um dia os arquivos voltarem a ser
// servidos, isto passa a renderizar sozinho, sem mudar uma linha.
// =============================================================================

import { useState } from 'react'
import { anexoLegadoSemConteudo, urlExibicaoAnexo } from '@/lib/anexo-url'
import {
  FileArchive,
  FileText,
  Image as ImageIcon,
  ImageOff,
  Video,
} from 'lucide-react'

/** Ícone por tipo MIME — mesma escolha na lista, na miniatura e no modal. */
export function iconePorTipo(type: string) {
  if (type.startsWith('image/')) return ImageIcon
  if (type.startsWith('video/')) return Video
  if (type.includes('zip') || type.includes('rar')) return FileArchive
  return FileText
}

export type MidiaAnexo = {
  id?: string
  fileName: string
  fileUrl: string
  fileType: string
}

/**
 * Renderiza a miniatura e, se a mídia não carregar, o aviso de indisponível no
 * lugar. Devolve também `indisponivel` pelo callback para quem precisa
 * desabilitar o clique de "visualizar".
 */
export function MiniaturaAnexo({
  anexo,
  onIndisponivel,
}: {
  anexo: MidiaAnexo
  onIndisponivel?: (v: boolean) => void
}) {
  const [falhou, setFalhou] = useState(false)
  const src = urlExibicaoAnexo({ id: anexo.id, fileUrl: anexo.fileUrl })
  const legadoSemRota = anexoLegadoSemConteudo(anexo.fileUrl) && !src

  const marcarFalha = () => {
    setFalhou(true)
    onIndisponivel?.(true)
  }

  if (falhou || legadoSemRota) {
    return (
      <span
        title="Arquivo indisponível — o anexo foi enviado numa versão anterior do portal e o conteúdo não está mais armazenado."
        className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/60"
      >
        <ImageOff className="h-4 w-4" />
      </span>
    )
  }

  if (anexo.fileType.startsWith('video/')) {
    return (
      <video
        src={src}
        className="h-full w-full object-cover"
        preload="metadata"
        muted
        onError={marcarFalha}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- export estático: sem otimizador de imagem, e data: URL não passa pelo <Image>
    <img
      src={src}
      alt={anexo.fileName}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={marcarFalha}
    />
  )
}

/** Texto único para todo lugar que precisa explicar o anexo perdido. */
export const AVISO_ARQUIVO_SUMIDO =
  'Arquivo indisponível. Este anexo foi enviado numa versão anterior do portal e o conteúdo não está mais armazenado — só o registro sobreviveu.'

/**
 * PDF, planilha e .zip não têm `onError`: o `<a download>` baixaria o
 * index.html do portal com o nome do arquivo original, e a pessoa só
 * descobriria ao tentar abrir. Aqui a checagem é explícita — se o servidor
 * responde `text/html` para algo que deveria ser PDF, o arquivo não existe.
 *
 * Só vale para URL de caminho: `data:` carrega o conteúdo consigo.
 */
export async function arquivoAlcancavel(
  url: string,
  fileType: string,
  opts?: { attachmentId?: string | null },
): Promise<boolean> {
  const resolved = urlExibicaoAnexo({ id: opts?.attachmentId, fileUrl: url })
  if (!resolved) return false
  if (resolved.startsWith('data:')) return true
  try {
    const res = await fetch(resolved, { method: 'HEAD' })
    if (!res.ok) return false
    const servido = (res.headers.get('content-type') || '').toLowerCase()
    // O portal é uma SPA: qualquer rota desconhecida devolve o index.html com
    // 200. HTML onde se esperava outro tipo é a assinatura do arquivo perdido.
    if (servido.startsWith('text/html') && !fileType.startsWith('text/html')) return false
    return true
  } catch {
    // Rede fora ou CORS: não dá para afirmar que sumiu — não acusa à toa.
    return true
  }
}
