"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import {
  Paperclip,
  Upload,
  FileText,
  Image as ImageIcon,
  FileArchive,
  Video,
  Download,
  Eye,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { AttachmentPreviewModal } from "./attachment-preview-modal";
import { MiniaturaAnexo, arquivoAlcancavel, AVISO_ARQUIVO_SUMIDO } from "./attachment-media";
import { anexoLegadoSemConteudo } from "@/lib/anexo-url";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { ANEXO_ACCEPT, ANEXO_MAX_MB, motivoRecusaAnexo, tipoDoArquivo } from '@/lib/anexos'

export type AttachmentItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
  uploaderName?: string | null;
};

// O que o servidor ACEITA de verdade. A tela prometia "qualquer arquivo, até
// 500 MB" e mandava para `POST /upload`, que é um stub devolvendo 501 — ou
// seja, anexar nunca funcionou e o operador via o erro cru na cara. A rota que
// funciona é `POST /tickets/:id/attachments`, que recebe o conteúdo em base64.
// Prometer menos e cumprir é melhor que prometer 500 MB e falhar sempre.
//
// A lista de tipos e o mapa por extensão viviam AQUI, copiados de
// `lib/anexos.ts`. Duas cópias da mesma regra é como uma delas fica para trás:
// em 04/09, ao passar a aceitar planilha, a lista do servidor e a do `anexos.ts`
// foram atualizadas e esta teria continuado recusando .xlsx sozinha. Agora vem
// da fonte — que por sua vez é espelho declarado do controller.
const MAX_SIZE_MB = ANEXO_MAX_MB;


function tipoDe(file: File): string {
  return tipoDoArquivo(file);
}

/** Lê o arquivo como base64 puro, sem o cabeçalho `data:`. */
function lerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    r.onload = () => {
      const s = String(r.result ?? '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.readAsDataURL(file);
  });
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function iconFor(type: string) {
  if (type.startsWith("image/")) return ImageIcon;
  if (type.startsWith("video/")) return Video;
  if (type.includes("zip") || type.includes("rar")) return FileArchive;
  return FileText;
}

function canPreview(type: string): boolean {
  return (
    type.startsWith("image/") ||
    type.startsWith("video/") ||
    type === "application/pdf" ||
    type === "text/plain"
  );
}

interface Props {
  ticketId: string;
  attachments: AttachmentItem[];
  canUpload?: boolean;
  canDelete?: boolean;
}

export function TicketAttachments({
  ticketId,
  attachments,
  canUpload = true,
  canDelete = true,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Array<{ name: string; reason: string }>>([]);
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AttachmentItem | null>(null);
  // Ids cujo arquivo não existe mais no servidor — ver attachment-media.tsx.
  const [semArquivo, setSemArquivo] = useState<Set<string>>(new Set());
  // A prop é só a carga inicial. Num export estático `router.refresh()` não
  // recarrega nada, então sem lista local o anexo subia e não aparecia.
  const [lista, setLista] = useState<AttachmentItem[]>(attachments);
  useEffect(() => setLista(attachments), [attachments]);

  const marcarSemArquivo = useCallback((id: string) => {
    setSemArquivo((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // Para PDF/zip/planilha não existe `onError`; a checagem é feita uma vez, na
  // montagem, e só para os que têm URL de caminho.
  useEffect(() => {
    let vivo = true;
    const semThumb = lista.filter(
      (a) => !a.fileType.startsWith("image/") && !a.fileType.startsWith("video/"),
    );
    void Promise.all(
      semThumb.map(async (a) => {
        const ok = await arquivoAlcancavel(a.fileUrl, a.fileType, { attachmentId: a.id });
        if (vivo && !ok) marcarSemArquivo(a.id);
      }),
    );
    return () => {
      vivo = false;
    };
  }, [lista, marcarSemArquivo]);

  const uploadFile = useCallback(
    async (file: File) => {
      const tipo = tipoDe(file);
      // Recusar aqui, com o motivo certo, em vez de deixar o servidor recusar
      // com uma frase genérica depois de ler o arquivo inteiro.
      const recusa = motivoRecusaAnexo(file);
      if (recusa) {
        setErrors((prev) => [...prev, { name: file.name, reason: recusa }]);
        return;
      }
      setUploading((prev) => [...prev, file.name]);
      try {
        const res = await araraApiFetch(`/api/tickets/${ticketId}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: file.name,
            file_type: tipo,
            file_size: file.size,
            content_base64: await lerBase64(file),
          }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          setErrors((prev) => [...prev, { name: file.name, reason: j?.error || 'falha ao anexar' }]);
          return;
        }
        // Acrescenta na hora. `router.refresh()` não recarrega nada num export
        // estático — o arquivo subia e não aparecia até alguém dar F5.
        if (j?.data) setLista((prev) => [j.data as AttachmentItem, ...prev]);
      } catch (err) {
        setErrors((prev) => [
          ...prev,
          { name: file.name, reason: err instanceof Error ? err.message : 'erro de rede' },
        ]);
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name));
      }
    },
    [ticketId]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      setErrors([]);
      await Promise.all(arr.map((f) => uploadFile(f)));
    },
    [uploadFile, router]
  );

  const handleDelete = useCallback(
    async (att: AttachmentItem) => {
      setDeleting(att.id);
      try {
        const res = await araraApiFetch(`/api/attachments/${att.id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: "Falha ao excluir" }));
          setErrors((prev) => [...prev, { name: att.fileName, reason: j.error || "Falha ao excluir" }]);
        } else {
          setLista((prev) => prev.filter((x) => x.id !== att.id));
        }
      } catch {
        setErrors((prev) => [...prev, { name: att.fileName, reason: "Erro de rede ao excluir" }]);
      } finally {
        setDeleting(null);
        setPendingDelete(null);
      }
    },
    [router]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canUpload) return;
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  return (
    <>
      <div className="rounded-lg bg-card p-6 shadow-[var(--shadow-media)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Paperclip className="inline h-4 w-4 mr-1.5 text-muted-foreground/70" />
            Anexos / Evidências
            {lista.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground/70">
                ({lista.length})
              </span>
            )}
          </h2>
        </div>

        {/* Lista de anexos existentes */}
        {lista.length > 0 && (
          <ul className="space-y-2 mb-4">
            {lista.map((att) => {
              const Icon = iconFor(att.fileType);
              const isDeletingThis = deleting === att.id;
              const isImage = att.fileType.startsWith("image/");
              const isVideo = att.fileType.startsWith("video/");
              const hasThumb = isImage || isVideo;
              // Legado nunca tem conteúdo: não depende da checagem de rede, que
              // pode falhar e deixar o botão de baixar ativo (TCK000675 3.5).
              const sumiu = semArquivo.has(att.id) || anexoLegadoSemConteudo(att.fileUrl);
              return (
                <li
                  key={att.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/50 px-3 py-2 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Thumbnail clicável para imagem/vídeo; ícone para os demais */}
                    {hasThumb ? (
                      <button
                        onClick={() => !sumiu && setPreview(att)}
                        disabled={sumiu}
                        title={sumiu ? AVISO_ARQUIVO_SUMIDO : "Visualizar em tela cheia"}
                        className="relative shrink-0 w-12 h-12 rounded overflow-hidden border border-border bg-muted transition-all focus:outline-none enabled:hover:ring-2 enabled:hover:ring-ring disabled:cursor-default"
                      >
                        <MiniaturaAnexo
                          anexo={att}
                          onIndisponivel={() => marcarSemArquivo(att.id)}
                        />
                        {isVideo && !sumiu && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Eye className="h-4 w-4 text-white drop-shadow" />
                          </span>
                        )}
                      </button>
                    ) : (
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground/80 truncate" title={att.fileName}>
                        {att.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {humanSize(att.fileSize)}
                        {att.uploaderName ? ` · ${att.uploaderName}` : ""}
                        {" · "}
                        {formatDate(att.createdAt)}
                      </p>
                      {sumiu && (
                        <p className="text-xs text-sem-warning-fg mt-0.5" title={AVISO_ARQUIVO_SUMIDO}>
                          Arquivo indisponível — só o registro sobreviveu
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Botão de olho apenas para tipos sem thumbnail (PDF, texto) */}
                    {canPreview(att.fileType) && !hasThumb && !sumiu && (
                      <button
                        onClick={() => setPreview(att)}
                        title="Visualizar"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-status-migration-fg px-1.5 py-1 rounded hover:bg-status-migration transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {/* Sem o arquivo, o download traria o index.html com o nome
                        do anexo — pior que não oferecer o botão. */}
                    {sumiu ? (
                      <span
                        title={AVISO_ARQUIVO_SUMIDO}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground/40 px-1.5 py-1"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <a
                        href={att.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        title="Baixar"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 rounded hover:bg-muted transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setPendingDelete(att)}
                        disabled={isDeletingThis}
                        title="Excluir"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-sem-error-fg px-1.5 py-1 rounded hover:bg-sem-error transition-colors disabled:opacity-40"
                      >
                        {isDeletingThis
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Drop-zone */}
        {canUpload && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
              ${isDragging
                ? "border-status-migration-bd bg-status-migration"
                : "border-border hover:border-border hover:bg-muted/50"
              }
            `}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground/70 mb-2" />
            <p className="text-sm text-foreground/60">
              <span className="font-medium text-status-migration-fg">Clique para selecionar</span>
              {" "}ou arraste arquivos aqui
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Imagem, vídeo, áudio, PDF, planilha, documento, texto, XML ou script (.sql, .sh, .py…) — até {MAX_SIZE_MB} MB por arquivo
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ANEXO_ACCEPT}
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        )}

        {/* Upload em progresso */}
        {uploading.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {uploading.map((name) => (
              <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="truncate">Enviando {name}…</span>
              </div>
            ))}
          </div>
        )}

        {/* Erros */}
        {errors.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {errors.map((e, i) => (
              <div
                key={`${e.name}-${i}`}
                className="flex items-center gap-2 text-xs text-sem-error-fg bg-sem-error border border-sem-error-bd px-2 py-1.5 rounded"
              >
                <X className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  <strong>{e.name}</strong>: {e.reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AttachmentPreviewModal attachment={preview} onClose={() => setPreview(null)} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && <>Tem certeza que deseja excluir &quot;{pendingDelete.fileName}&quot;? Essa ação não pode ser desfeita.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-sem-error-fg hover:opacity-90"
              disabled={!!deleting}
              onClick={(e) => { e.preventDefault(); if (pendingDelete) handleDelete(pendingDelete); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
