"use client";

import { useEffect, useState } from "react";
import { X, Download, FileText, ImageOff } from "lucide-react";
import { AVISO_ARQUIVO_SUMIDO } from "./attachment-media";
import { urlExibicaoAnexo } from "@/lib/anexo-url";

// Estrutural — aceita tanto AttachmentItem (ticket-attachments.tsx) quanto
// CardImage (card-images.tsx), já que o modal só lê esses 3 campos.
export type PreviewableFile = {
  fileName: string;
  fileUrl: string;
  fileType: string;
};

interface Props {
  attachment: PreviewableFile | null;
  onClose: () => void;
}

export function AttachmentPreviewModal({ attachment, onClose }: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  // Mesmo caso da miniatura: o arquivo pode não existir mais no servidor.
  const [sumiu, setSumiu] = useState(false);

  const mediaUrl = attachment
    ? urlExibicaoAnexo({
        id: (attachment as PreviewableFile & { id?: string }).id,
        fileUrl: attachment.fileUrl,
      })
    : '';

  useEffect(() => {
    setSumiu(false);
  }, [attachment]);

  useEffect(() => {
    if (!attachment) { setTextContent(null); return; }
    if (!mediaUrl) {
      setSumiu(true);
      return;
    }
    if (attachment.fileType === "text/plain") {
      setTextLoading(true);
      fetch(mediaUrl)
        .then((r) => r.text())
        .then((t) => setTextContent(t))
        .catch(() => setTextContent("Não foi possível carregar o conteúdo."))
        .finally(() => setTextLoading(false));
    } else {
      setTextContent(null);
    }
  }, [attachment, mediaUrl]);

  if (!attachment) return null;

  const isImage = attachment.fileType.startsWith("image/");
  const isVideo = attachment.fileType.startsWith("video/");
  const isPdf   = attachment.fileType === "application/pdf";
  const isText  = attachment.fileType === "text/plain";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-background rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
          <p className="text-sm font-medium text-foreground/80 truncate pr-4" title={attachment.fileName}>
            {attachment.fileName}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={mediaUrl || undefined}
              download
              className="inline-flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground border border-border rounded px-2 py-1"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar
            </a>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-auto bg-muted/50 flex items-center justify-center min-h-0">
          {sumiu && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground/70 py-16 px-8 text-center">
              <ImageOff className="h-12 w-12" />
              <p className="text-sm max-w-md">{AVISO_ARQUIVO_SUMIDO}</p>
            </div>
          )}

          {isImage && !sumiu && (
            <img
              src={mediaUrl}
              alt={attachment.fileName}
              onError={() => setSumiu(true)}
              className="max-w-full max-h-full object-contain p-4"
            />
          )}

          {isVideo && !sumiu && (
            <video
              src={mediaUrl}
              controls
              onError={() => setSumiu(true)}
              className="max-w-full max-h-full"
              style={{ maxHeight: "calc(90vh - 56px)" }}
            />
          )}

          {isPdf && !sumiu && (
            <iframe
              src={mediaUrl}
              title={attachment.fileName}
              className="w-full"
              style={{ height: "calc(90vh - 56px)", border: "none" }}
            />
          )}

          {isText && !sumiu && (
            <div className="w-full h-full overflow-auto p-4">
              {textLoading ? (
                <p className="text-sm text-muted-foreground/70">Carregando…</p>
              ) : (
                <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-mono">
                  {textContent}
                </pre>
              )}
            </div>
          )}

          {!isImage && !isVideo && !isPdf && !isText && !sumiu && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground/70 py-16">
              <FileText className="h-12 w-12" />
              <p className="text-sm">Pré-visualização não disponível para este tipo de arquivo.</p>
              <a
                href={mediaUrl || undefined}
                download
                className="text-sm text-primary hover:underline"
              >
                Clique aqui para baixar
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
