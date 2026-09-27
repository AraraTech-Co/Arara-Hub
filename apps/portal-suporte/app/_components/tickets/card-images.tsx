"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImagePlus, Star, Trash2, Loader2, X } from "lucide-react";
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { MiniaturaAnexo } from './attachment-media'
import { anexarAoChamado } from '@/lib/anexos'

export type CardImage = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  position: number;
};

const MAX_SIZE_MB = 500;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface Props {
  ticketId: string;
  images: CardImage[];
}

function SortableThumb({
  image,
  isCover,
  onSetCover,
  onDelete,
  deleting,
}: {
  image: CardImage;
  isCover: boolean;
  onSetCover: (id: string) => void;
  onDelete: (image: CardImage) => void;
  deleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative shrink-0 w-24 h-24 rounded-md overflow-hidden border border-border bg-muted cursor-grab active:cursor-grabbing"
    >
      <MiniaturaAnexo anexo={image} />

      {isCover && (
        <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 text-[10px] font-medium bg-sem-info text-sem-info-fg border border-sem-info-bd rounded px-1 py-0.5">
          <Star className="h-2.5 w-2.5 fill-current" />
          Capa
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-0.5 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 to-transparent">
        {!isCover && (
          <button
            type="button"
            title="Definir como capa"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onSetCover(image.id); }}
            className="inline-flex items-center justify-center h-5 w-5 rounded bg-background/80 text-foreground/80 hover:text-sem-info-fg"
          >
            <Star className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          title="Excluir"
          disabled={deleting}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(image); }}
          className="inline-flex items-center justify-center h-5 w-5 rounded bg-background/80 text-foreground/80 hover:text-sem-error-fg disabled:opacity-40"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

export function CardImages({ ticketId, images }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<CardImage[] | null>(null);

  const ordered = localOrder ?? images;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const persistOrder = useCallback(
    async (orderedIds: string[]) => {
      try {
        await araraApiFetch(`/api/tickets/${ticketId}/attachments/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        });
      } finally {
        router.refresh();
      }
    },
    [ticketId, router]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setUploading((prev) => [...prev, file.name]);
      try {
        // Ia para `POST /upload`, um stub 501 — enviar imagem de card nunca
        // funcionou. Ver lib/anexos.ts.
        await anexarAoChamado(ticketId, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro de rede");
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name));
      }
    },
    [ticketId]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!arr.length) return;
      setError(null);
      setLocalOrder(null);
      await Promise.all(arr.map((f) => uploadFile(f)));
      router.refresh();
    },
    [uploadFile, router]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []).filter((i) =>
        i.type.startsWith("image/")
      );
      if (!items.length) return;
      e.preventDefault();
      const files = items.map((i) => i.getAsFile()).filter((f): f is File => !!f);
      if (files.length) handleFiles(files);
    },
    [handleFiles]
  );

  const handleDelete = useCallback(
    async (image: CardImage) => {
      if (!confirm(`Excluir "${image.fileName}"?`)) return;
      setDeleting(image.id);
      try {
        const res = await araraApiFetch(`/api/attachments/${image.id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: "Falha ao excluir" }));
          setError(j.error || "Falha ao excluir");
        } else {
          setLocalOrder(null);
          router.refresh();
        }
      } catch {
        setError("Erro de rede ao excluir");
      } finally {
        setDeleting(null);
      }
    },
    [router]
  );

  const handleSetCover = useCallback(
    (id: string) => {
      const current = ordered;
      const idx = current.findIndex((i) => i.id === id);
      if (idx <= 0) return;
      const next = arrayMove(current, idx, 0);
      setLocalOrder(next);
      persistOrder(next.map((i) => i.id));
    },
    [ordered, persistOrder]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = ordered.findIndex((i) => i.id === active.id);
      const newIndex = ordered.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(ordered, oldIndex, newIndex);
      setLocalOrder(next);
      persistOrder(next.map((i) => i.id));
    },
    [ordered, persistOrder]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      ref={dropZoneRef}
      tabIndex={0}
      onPaste={handlePaste}
      className="rounded-lg bg-card p-4 space-y-3 focus:outline-none focus:ring-2 focus:ring-ring/20 shadow-[var(--shadow-media)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          <ImagePlus className="inline h-4 w-4 mr-1.5 text-muted-foreground/70" />
          Imagens do card
          {ordered.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground/70">
              ({ordered.length})
            </span>
          )}
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {ordered.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ordered.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
              {ordered.map((image, idx) => (
                <SortableThumb
                  key={image.id}
                  image={image}
                  isCover={idx === 0}
                  onSetCover={handleSetCover}
                  onDelete={handleDelete}
                  deleting={deleting === image.id}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {/* Dropzone / adicionar */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          className={`shrink-0 w-24 h-24 rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            isDragging
              ? "border-status-migration-bd bg-status-migration"
              : "border-border hover:border-border hover:bg-muted/50"
          }`}
        >
          <ImagePlus className="h-5 w-5 text-muted-foreground/70" />
          <span className="text-[10px] text-muted-foreground/70 text-center px-1">
            Colar, arrastar ou clicar
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>
      </div>

      {uploading.length > 0 && (
        <div className="space-y-1">
          {uploading.map((name) => (
            <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="truncate">Enviando {name}…</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-sem-error-fg bg-sem-error border border-sem-error-bd px-2 py-1.5 rounded">
          <X className="h-3 w-3 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}
    </div>
  );
}
