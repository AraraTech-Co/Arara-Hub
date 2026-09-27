import { useState } from "react";
import { useRouter } from "next/navigation";
import { ticketsApi } from "@/lib/api/tickets";
import { validatePullRequestUrl, PULL_REQUEST_URL_ERROR } from "@/lib/pull-request-url";

interface EditableTicket {
  id: string;
  title: string;
  description: string;
  category: string | null;
  severity?: string | null;
  ticket_type?: string | null;
  recurring?: boolean | null;
  tags?: string[] | null;
  company_name: string | null;
  company_cnpj: string | null;
  pull_request_url?: string | null;
}

function buildForm(ticket: EditableTicket) {
  return {
    // `?? ""` nos dois: chamado sem título ou sem descrição existe — e sem
    // isto o formulário nasce com `undefined`, que estoura no primeiro
    // `.trim()` do salvamento. Campo obrigatório se cobra na validação, não
    // deixando a tela quebrar.
    title: ticket.title ?? "",
    description: ticket.description ?? "",
    category: ticket.category ?? "",
    severity: ticket.severity ?? "",
    ticket_type: ticket.ticket_type ?? "",
    recurring: !!ticket.recurring,
    tagsRaw: (ticket.tags ?? []).join(", "), // input simples vírgula-separado
    company_name: ticket.company_name ?? "",
    company_cnpj: ticket.company_cnpj ?? "",
    pull_request_url: ticket.pull_request_url ?? "",
  };
}

/**
 * Estado + persistência do formulário de edição do ticket (título, descrição,
 * categoria, severidade, tipo, tags, empresa/CNPJ, PR). Extraído de
 * admin-ticket-details.tsx para reduzir o tamanho do componente.
 */
export function useTicketEditForm(ticket: EditableTicket, isDescriptionLocked: boolean) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => buildForm(ticket));

  const startEdit = () => {
    setError(null);
    setForm(buildForm(ticket));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setError(null);
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!form.title.trim()) {
      setError("Título obrigatório.");
      return;
    }
    if (!isDescriptionLocked && !form.description.trim()) {
      setError("Descrição obrigatória.");
      return;
    }

    const prUrlRaw = form.pull_request_url.trim();
    const prUrl = prUrlRaw ? validatePullRequestUrl(prUrlRaw) : null;
    if (prUrlRaw && !prUrl) {
      setError(PULL_REQUEST_URL_ERROR);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const tags = form.tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Monta payload omitindo campos vazios (DTO atual aceita opcional, não null)
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        recurring: form.recurring,
        tags,
      };
      if (!isDescriptionLocked) {
        payload.description = form.description.trim();
      }
      const category = form.category.trim();
      if (category) payload.category = category;
      if (form.severity) payload.severity = form.severity;
      if (form.ticket_type) payload.ticket_type = form.ticket_type;
      // Empresa: envia sempre (inclusive string vazia para limpar)
      payload.company_name = form.company_name.trim() || null;
      payload.company_cnpj = form.company_cnpj.trim() || null;
      payload.pull_request_url = prUrl;

      await ticketsApi.update(ticket.id, payload);
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSaving(false);
    }
  };

  return { form, setForm, isEditing, saving, error, startEdit, cancelEdit, saveEdit };
}
