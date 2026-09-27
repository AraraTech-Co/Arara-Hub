"use client";

import { useState, useRef, useEffect } from "react";
import { KbSuggestions } from "@/components/kb/kb-suggestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { voltarAoQuadro } from '@/lib/voltar-ao-quadro';
import { araraApiFetch } from '@/lib/arara/arara-api-fetch';
import {
  ArrowLeft,
  Calendar,
  Building2,
  Mail,
  Tag,
  Hash,
  ExternalLink,
  Phone,
  Radio,
  Pencil,
  Save,
  X,
  Loader2,
  Archive,
  Trash2,
  Star,
  FileText,
  GitPullRequest,
  MapPin,
  UserCircle,
  UserCheck,
  ArrowDownLeft,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { ticketSourceLabel } from "@/lib/ticket-source";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TicketActionsCard } from "./ticket-actions-card";
import { CardImages, type CardImage } from "./card-images";
import { AttachmentPreviewModal } from "./attachment-preview-modal";
import { MiniaturaAnexo } from "./attachment-media";
import { verify } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ticketsApi } from "@/lib/api/tickets";
import { useTicketEditForm } from "@/hooks/use-ticket-edit-form";

interface AdminTicketDetailsProps {
  ticket: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    client_priority?: string | null;
    ai_priority?: string | null;
    ai_justification?: string | null;
    category: string | null;
    severity?: string | null;
    ticket_type?: string | null;
    tags?: string[] | null;
    recurring?: boolean | null;
    pull_request_url?: string | null;
    created_at: string;
    is_public: boolean;
    company_name: string | null;
    company_cnpj: string | null;
    contact_email: string | null;
    communication_preference: string | null;
  source?: string | null;
    ticket_number?: string | null;
    requester?: string | null;
    unit?: { id: string; name: string; city: string | null; state: string | null } | null;
    received_by?: { id: string; full_name: string | null; email: string } | null;
    user: {
      id: string;
      full_name: string | null;
      email: string;
    } | null;
    assigned_to: {
      id: string;
      full_name: string | null;
      email: string;
    } | null;
    co_assignees?: Array<{
      id: string;
      full_name: string | null;
      email: string;
      role: string;
    }>;
    rating?: { score: number | null; token: string } | null;
  };
  agents: Array<{
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  }>;
  companies?: string[];
  userRole?: string;
  images?: CardImage[];
  /** O card de ações passou a viver fora, sempre visível — não repetir aqui. */
  ocultarAcoes?: boolean;
}

const DESCRIPTION_EDITABLE_STATUSES = new Set(['novos_chamados', 'triagem'])

const communicationPreferenceLabels: Record<string, string> = {
  email: "E-mail",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  chat: "Chat",
};

// Renomeado de N0-N3 para P0-P3 na migration 20260519000100_kanban_trello_sync
const severityOptions = ["P0", "P1", "P2", "P3"];
const ticketTypeOptions = [
  { value: "suporte", label: "Suporte" },
  { value: "duvida", label: "Dúvida" },
  { value: "incidente", label: "Incidente" },
  { value: "bug", label: "Bug" },
  { value: "evolucao", label: "Evolução" },
];

// =============================================================================
// Componente
// =============================================================================

export function AdminTicketDetails({ ticket, agents, companies = [], userRole = "developer", images = [], ocultarAcoes = false }: AdminTicketDetailsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);

  // Acompanhamento do cliente: o código existe no banco desde a abertura, mas
  // não aparecia em lugar nenhum — nem para quem atende. Enquanto a lista de
  // saída da API esteve vazia, os avisos não saíram e esses códigos ficaram
  // gravados sem ninguém nunca ter visto.
  const [copiado, setCopiado] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [reenvio, setReenvio] = useState<string | null>(null);

  const acomp = ticket as unknown as { acomp_whatsapp?: string; acomp_codigo?: string };

  const mascararFone = (cru: string) => {
    const d = String(cru || '').replace(/\D/g, '');
    if (d.length < 6) return d;
    return `${d.slice(0, 4)}${'•'.repeat(Math.max(0, d.length - 6))}${d.slice(-2)}`;
  };

  const reenviarAcompanhamento = async () => {
    setReenviando(true); setReenvio(null);
    try {
      const r = await araraApiFetch(`/api/tickets/${ticket.id}/reenviar-acompanhamento`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setReenvio(String(j.error || 'Falhou ao reenviar.')); return; }
      const etapa = String(j?.data?.desfecho?.etapa || '');
      const st = j?.data?.desfecho?.status;
      // "Aceito", não "entregue": 200 do provedor não é prova de entrega.
      setReenvio(etapa === 'enviado' ? `Aceito pelo provedor (HTTP ${st ?? '?'})`
        : etapa === 'sem_token' ? 'whatsapp_token não configurado no cofre do app'
        : etapa === 'falhou' ? `Falhou: ${j?.data?.desfecho?.erro || 'erro desconhecido'}`
        : 'Sem desfecho registrado');
    } catch (e) {
      setReenvio(e instanceof Error ? e.message : 'Falhou ao reenviar.');
    } finally { setReenviando(false); }
  };
  const companyRef = useRef<HTMLDivElement>(null);
  const [previewImage, setPreviewImage] = useState<CardImage | null>(null);
  const [capaQuebrada, setCapaQuebrada] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) {
        setShowCompanySuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isDescriptionLocked =
    !DESCRIPTION_EDITABLE_STATUSES.has(ticket.status) &&
    !verify('admin', { role: userRole })

  const { form, setForm, isEditing, saving, error, startEdit, cancelEdit, saveEdit } =
    useTicketEditForm(ticket, isDescriptionLocked);

  // ─── Arquivar / Excluir ──────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleArchive = async () => {
    setArchiveLoading(true);
    try {
      await ticketsApi.archive(ticket.id);
      router.push("/admin/kanban");
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await ticketsApi.delete(ticket.id);
      router.push("/admin/kanban");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erro ao excluir ticket.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 items-start lg:flex-row">
      {/* Left main content */}
      <div className="flex-1 min-w-0 w-full space-y-6">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => voltarAoQuadro(router)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Kanban
        </Button>

        {/* Capa — primeira imagem do arranjo (index 0). Se o arquivo não existe
            mais (anexos do deploy anterior; ver attachment-media.tsx), a faixa
            some por inteiro: um chamado sem capa é melhor que uma tarja com o
            ícone de imagem quebrada no topo da ficha. */}
        {images.length > 0 && !capaQuebrada && (
          <button
            type="button"
            onClick={() => setPreviewImage(images[0])}
            className="block w-full rounded-lg overflow-hidden border border-border bg-muted max-h-80"
          >
            <img
              src={images[0].fileUrl}
              alt={images[0].fileName}
              width={1200}
              height={320}
              onError={() => setCapaQuebrada(true)}
              className="w-full max-h-80 object-cover"
            />
          </button>
        )}

        {/* Galeria somente-leitura — demais imagens (index 1+). Some em modo edição,
            onde o editor CardImages abaixo já mostra tudo com drag/capa/excluir. */}
        {!isEditing && images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.slice(1).map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setPreviewImage(image)}
                className="shrink-0 w-24 h-24 rounded-md overflow-hidden border border-border bg-muted"
              >
                <MiniaturaAnexo anexo={image} />
              </button>
            ))}
          </div>
        )}

        {/* Header — título, ticket_number, badges */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {ticket.ticket_number && (
                <span className="font-mono text-sm text-muted-foreground/70">
                  {ticket.ticket_number}
                </span>
              )}
              {ticket.is_public && (
                <Badge className="bg-sem-info text-sem-info-fg border border-sem-info-bd">
                  <Building2 className="mr-1 h-3 w-3" />
                  Ticket Público
                </Badge>
              )}
              {!isEditing && ticket.category && (
                <Badge variant="outline" className="text-foreground/60">
                  <Tag className="mr-1 h-3 w-3" />
                  {ticket.category}
                </Badge>
              )}
              {!isEditing && ticket.recurring && (
                <Badge variant="outline" className="bg-status-pending text-status-pending-fg border-status-pending-bd">
                  Recorrente
                </Badge>
              )}
            </div>

            {!isEditing ? (
              <Button
                size="sm"
                variant="outline"
                onClick={startEdit}
                className="text-foreground/60"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="text-muted-foreground"
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={saveEdit}
                  disabled={saving}
                  className="bg-status-migration-fg hover:opacity-90 text-background"
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Salvar
                </Button>
              </div>
            )}
          </div>

          {!isEditing ? (
            <h1 className="text-2xl font-bold text-foreground leading-tight">
              {ticket.title}
            </h1>
          ) : (
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full text-2xl font-bold text-foreground leading-tight border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
              placeholder="Título do ticket"
            />
          )}

          {error && (
            <p className="text-sm text-sem-error-fg bg-sem-error border border-sem-error-bd rounded px-3 py-1.5">
              {error}
            </p>
          )}
        </div>

        {/* Description card — texto completo na leitura; textarea com resize livre na edição */}
        <div className="rounded-lg bg-card p-6 shadow-[var(--shadow-media)]">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Descrição
            </h2>
            {isDescriptionLocked && (
              <span className="text-[10px] font-medium text-sem-warning-fg border border-sem-warning-bd bg-sem-warning rounded px-1.5 py-0.5">
                🔒 Bloqueada após triagem
              </span>
            )}
          </div>
          {!isEditing ? (
            <div className="text-foreground/80 leading-relaxed whitespace-pre-wrap min-h-[200px]">
              {ticket.description}
            </div>
          ) : isDescriptionLocked ? (
            <div title="Descrição bloqueada após a triagem" className="cursor-not-allowed">
              <textarea
                disabled
                value={form.description}
                className="w-full min-h-[200px] text-muted-foreground leading-relaxed border border-border rounded-md px-3 py-2 font-sans bg-muted/50 opacity-60 cursor-not-allowed resize-y"
              />
            </div>
          ) : (
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              className="w-full min-h-[200px] text-foreground/80 leading-relaxed border border-border rounded-md px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring resize-y"
              placeholder="Descrição detalhada do ticket"
            />
          )}
        </div>

        {/* Imagens do card — paste (Ctrl+V) / drag-drop / capa, dentro do editor */}
        {isEditing && <CardImages ticketId={ticket.id} images={images} />}

        {/* Bloco de campos extras (categoria, severidade, tipo, recorrente, tags) — só em modo edição */}
        {isEditing && (
          <div className="rounded-lg bg-card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-[var(--shadow-media)]">
            <div>
              <label htmlFor="ticket-category" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Categoria
              </label>
              <input
                id="ticket-category"
                type="text"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                placeholder="ex.: Fiscal, Faturamento..."
              />
            </div>

            <div>
              <label htmlFor="ticket-severity" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Severidade
              </label>
              <select
                id="ticket-severity"
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
              >
                <option value="">— sem severidade —</option>
                {severityOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ticket-type" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Tipo
              </label>
              <select
                id="ticket-type"
                value={form.ticket_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ticket_type: e.target.value }))
                }
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
              >
                <option value="">— sem tipo —</option>
                {ticketTypeOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                id="recurring"
                type="checkbox"
                checked={form.recurring}
                onChange={(e) =>
                  setForm((f) => ({ ...f, recurring: e.target.checked }))
                }
                className="h-4 w-4 rounded border-border text-status-migration-fg focus:ring-status-migration-bd"
              />
              <label htmlFor="recurring" className="text-sm text-foreground/80">
                Incidente recorrente
              </label>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="ticket-tags" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Tags (separadas por vírgula)
              </label>
              <input
                id="ticket-tags"
                type="text"
                value={form.tagsRaw}
                onChange={(e) => setForm((f) => ({ ...f, tagsRaw: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                placeholder="ex.: fiscal, sped, urgente"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="ticket-pr-url" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Link do Pull Request
              </label>
              <input
                id="ticket-pr-url"
                type="url"
                value={form.pull_request_url}
                onChange={(e) => setForm((f) => ({ ...f, pull_request_url: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                placeholder="https://github.com/org/repo/pull/123"
              />
            </div>

            <div ref={companyRef} className="relative">
              <label htmlFor="ticket-company-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Empresa
              </label>
              <input
                id="ticket-company-name"
                type="text"
                value={form.company_name}
                onChange={(e) => { setForm((f) => ({ ...f, company_name: e.target.value })); setShowCompanySuggestions(true); }}
                onFocus={() => setShowCompanySuggestions(true)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                placeholder="Nome da empresa"
                autoComplete="off"
              />
              {showCompanySuggestions && companies.filter(c =>
                c.toLowerCase().includes(form.company_name.toLowerCase()) && form.company_name.length > 0
              ).length > 0 && (
                <ul className="absolute z-50 w-full rounded-md border border-border bg-background shadow-lg max-h-40 overflow-y-auto">
                  {companies
                    .filter(c => c.toLowerCase().includes(form.company_name.toLowerCase()))
                    .map(c => (
                      <li
                        key={c}
                        onMouseDown={() => { setForm((f) => ({ ...f, company_name: c })); setShowCompanySuggestions(false); }}
                        className="px-3 py-1.5 text-sm text-foreground/80 hover:bg-muted cursor-pointer"
                      >
                        {c}
                      </li>
                    ))
                  }
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="ticket-company-cnpj" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                CNPJ
              </label>
              <input
                id="ticket-company-cnpj"
                type="text"
                value={form.company_cnpj}
                onChange={(e) => setForm((f) => ({ ...f, company_cnpj: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                placeholder="00.000.000/0001-00"
              />
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-4">
        {/* Actions card — some quando a tela já o mostra fora do "Editar". */}
        {!ocultarAcoes && <TicketActionsCard
          ticket={ticket}
          agents={agents}
          userRole={userRole}
          onRefresh={() => router.refresh()}
        />}

        {/* Pessoas — Solicitante / Quem recebeu / Responsável */}
        <div className="rounded-lg bg-card p-4 space-y-3 shadow-[var(--shadow-media)]">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pessoas</p>

          <div className="flex items-start gap-2.5">
            <UserCircle className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Solicitante</p>
              <p className="text-sm text-foreground/80 truncate">{ticket.requester || "—"}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <ArrowDownLeft className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Quem recebeu</p>
              <p className="text-sm text-foreground/80 truncate">
                {ticket.received_by?.full_name || ticket.received_by?.email || "—"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <UserCheck className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Responsável</p>
              <p className="text-sm text-foreground/80 truncate">
                {ticket.assigned_to?.full_name || ticket.assigned_to?.email || "Sem responsável"}
              </p>
            </div>
          </div>

          {ticket.unit?.name && (
            <div className="flex items-start gap-2.5 border-t border-border/50 pt-3">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Filial</p>
                <p className="text-sm text-foreground/80 truncate">
                  {ticket.unit.name}{ticket.unit.city ? ` — ${ticket.unit.city}${ticket.unit.state ? `/${ticket.unit.state}` : ""}` : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Acompanhamento do cliente — só equipe vê */}
        {(acomp.acomp_codigo || acomp.acomp_whatsapp) && (
          <div className="rounded-lg bg-card p-4 space-y-3 shadow-[var(--shadow-media)]">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Acompanhamento do cliente
            </p>

            {acomp.acomp_whatsapp && (
              <div>
                <p className="text-[11px] text-muted-foreground">WhatsApp</p>
                <p className="text-sm font-mono text-foreground/80">{mascararFone(acomp.acomp_whatsapp)}</p>
              </div>
            )}

            {acomp.acomp_codigo && (
              <div>
                <p className="text-[11px] text-muted-foreground">Código</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono tracking-[0.25em] text-foreground">{acomp.acomp_codigo}</p>
                  <Button
                    type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
                    onClick={() => {
                      navigator.clipboard?.writeText(String(acomp.acomp_codigo || ''));
                      setCopiado(true); setTimeout(() => setCopiado(false), 1500);
                    }}
                  >
                    {copiado ? 'copiado' : 'copiar'}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Serve para o cliente acompanhar em /acompanhar, junto do número do chamado.
                </p>
              </div>
            )}

            {acomp.acomp_whatsapp && acomp.acomp_codigo && (
              <div>
                <Button
                  type="button" variant="outline" size="sm" className="h-7 text-xs"
                  disabled={reenviando} onClick={reenviarAcompanhamento}
                >
                  {reenviando ? 'Reenviando…' : 'Reenviar por WhatsApp'}
                </Button>
                {reenvio && <p className="mt-1 text-[11px] text-muted-foreground">{reenvio}</p>}
              </div>
            )}
          </div>
        )}

        {/* Metadata card */}
        <div className="rounded-lg bg-card p-4 space-y-3 shadow-[var(--shadow-media)]">
          <div className="flex items-start gap-2.5">
            <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                Criado em
              </p>
              <p className="text-sm text-foreground/80">
                {formatDate(ticket.created_at)}
              </p>
            </div>
          </div>

          {ticket.ticket_number && (
            <div className="flex items-start gap-2.5">
              <Hash className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Número
                </p>
                <p className="text-sm font-mono text-foreground/80">{ticket.ticket_number}</p>
              </div>
            </div>
          )}

          {ticket.category && !isEditing && (
            <div className="flex items-start gap-2.5">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Categoria
                </p>
                <p className="text-sm text-foreground/80">{ticket.category}</p>
              </div>
            </div>
          )}

          {ticket.severity && !isEditing && (
            <div className="flex items-start gap-2.5">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Severidade
                </p>
                <p className="text-sm text-foreground/80">{ticket.severity}</p>
              </div>
            </div>
          )}

          {ticket.ticket_type && !isEditing && (
            <div className="flex items-start gap-2.5">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Tipo
                </p>
                <p className="text-sm text-foreground/80 capitalize">
                  {ticket.ticket_type}
                </p>
              </div>
            </div>
          )}

          {ticket.tags && ticket.tags.length > 0 && !isEditing && (
            <div className="flex items-start gap-2.5">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ticket.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="text-xs bg-muted/50 text-foreground/60"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {ticket.pull_request_url && !isEditing && (
            <div className="flex items-start gap-2.5">
              <GitPullRequest className="mt-0.5 h-4 w-4 text-status-pending-dev-fg shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Pull Request
                </p>
                <a
                  href={ticket.pull_request_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-status-pending-dev-fg hover:underline break-all inline-flex items-center gap-1"
                >
                  Abrir PR
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            </div>
          )}

          {ticket.source && ticket.source !== 'portal' && (
            <div className="flex items-start gap-2.5">
              <Radio className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Origem
                </p>
                <p className="text-sm text-foreground/80">
                  {ticketSourceLabel(ticket.source)}
                </p>
              </div>
            </div>
          )}

          {ticket.communication_preference && (
            <div className="flex items-start gap-2.5">
              <Phone className="mt-0.5 h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Canal preferido
                </p>
                <p className="text-sm text-foreground/80">
                  {communicationPreferenceLabels[ticket.communication_preference] ??
                    ticket.communication_preference}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Company info (public tickets only) */}
        {ticket.is_public && (
          <div className="rounded-lg bg-sem-info border border-sem-info-bd p-4 space-y-2">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-2">
              Informações da Empresa
            </p>
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-sem-info-fg">
                  {ticket.company_name || "Empresa não informada"}
                </p>
                {ticket.company_cnpj && (
                  <p className="text-xs text-blue-600 mt-0.5">
                    CNPJ: {ticket.company_cnpj}
                  </p>
                )}
              </div>
            </div>
            {ticket.contact_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-400 shrink-0" />
                <p className="text-sm text-sem-info-fg break-all">{ticket.contact_email}</p>
              </div>
            )}
          </div>
        )}

        {/* KB Suggestions */}
        <KbSuggestions query={ticket.title} />

        {/* CSAT Rating */}
        {ticket.rating && (
          <div className="rounded-lg border border-sem-warning-bd bg-sem-warning px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sem-warning-fg">
              Avaliação do cliente
            </p>
            {ticket.rating.score ? (
              <>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star
                      key={s}
                      className={cn(
                        "h-5 w-5",
                        s <= ticket.rating!.score!
                          ? "fill-sem-warning-fg text-sem-warning-fg"
                          : "text-sem-warning-bd"
                      )}
                    />
                  ))}
                  <span className="ml-1 text-sm font-bold text-sem-warning-fg">
                    {ticket.rating.score}/5
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-sem-warning-fg">Aguardando avaliação</p>
            )}
          </div>
        )}

        {/* Exportar PDF */}
        <Button
          variant="outline"
          className="w-full gap-2 border-border text-foreground/60 hover:text-foreground hover:bg-muted/50"
          onClick={() => window.open(`/api/tickets/${ticket.id}/pdf`, '_blank')}
        >
          <FileText className="h-4 w-4" />
          Exportar PDF
        </Button>

        {/* Ver no Kanban */}
        <Button
          asChild
          variant="outline"
          className="w-full border-border text-foreground/60 hover:text-foreground hover:bg-muted/50"
        >
          <Link href={`/admin/kanban`}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Ver no Kanban
          </Link>
        </Button>

        {/* Arquivar / Excluir */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 text-sem-warning-fg border-sem-warning-bd hover:bg-sem-warning"
            onClick={handleArchive}
            disabled={archiveLoading}
          >
            {archiveLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Arquivar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 text-sem-error-fg border-sem-error-bd hover:bg-sem-error"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => { setConfirmDelete(open); if (!open) setDeleteError(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ticket permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O ticket e todas as mensagens,
              anexos, checklists e co-responsáveis serão removidos do banco de dados.
              <br /><br />
              Se quiser apenas remover do Kanban, use <strong>Arquivar</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-sem-error-fg bg-sem-error border border-sem-error-bd rounded px-3 py-1.5">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-sem-error-fg hover:opacity-90"
              disabled={deleteLoading}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
            >
              {deleteLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AttachmentPreviewModal attachment={previewImage} onClose={() => setPreviewImage(null)} />

    </div>
  );
}
