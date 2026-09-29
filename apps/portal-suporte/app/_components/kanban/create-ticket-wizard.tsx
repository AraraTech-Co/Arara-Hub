'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PRIORITY_KEYS, PRIORITY_LABELS, SEVERITY_LABELS, getPriorityEmoji, getPriorityLabel } from '@/lib/ticket-priority';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, X, Plus, Upload, ChevronLeft, ChevronRight,
  Check, Pencil, Clock, AlertTriangle, BookOpen, Sparkles,
} from 'lucide-react';
import { cn, formatDate , telefoneCompleto } from '@/lib/utils';
import { CompanySelector } from './company-selector';
import type { CompanySelectionUpdate } from './company-selector';
import { ticketsApi } from '@/lib/api/tickets';
import { kbApi } from '@/lib/api/kb';
import { StepperHeader } from './wizard/stepper-header';
import { Field } from './wizard/field';
import { CardSelector } from './wizard/card-selector';
import { ReviewRow } from './wizard/review-row';
import { getContextFields, formatContextBlock } from './wizard/context-fields';
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { anexarAoChamado } from '@/lib/anexos'
import { mascaraTelefone } from '@/lib/utils'

interface WizardFormData {
  // Step 1 — Empresa & Contato
  company_name: string;
  company_id: string | null;
  unit_id: string | null;
  contact_id: string | null;
  company_cnpj: string;
  contact_email: string;
  contact_phone: string;
  comm_pref: string;
  requester: string;

  // Step 2 — Tipo & Prioridade
  ticket_type: string;
  priority: string;
  severity: string;
  impact: string;
  urgency: string;
  category: string;

  // Step 2b — Contexto Operacional (dynamic, based on category)
  context_data: Record<string, string>;

  // Step 3 — Descrição
  title: string;
  description: string;
  occurred_at: string;

  // Step 4 — Anexos
  files: File[];
  tags: string[];

  // Step 5 — SLA & Agendamento
  assigned_to: string;
  team_id: string;
  is_public: boolean;
  time_start: string;
  time_end: string;

  // Reporter info (Step 0)
  reporter_role: string;

  // Reproduction steps (Step 3)
  steps: { step1: string; step2: string; step3: string };

  // internal
  tagInput: string;
}

export interface CreateTicketWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (ticket: any) => void;
  agents?: Array<{ id: string; full_name: string | null; email: string; role?: string }>;
  teams?: Array<{ id: string; name: string; color: string }>;
  companies?: string[];
}

// ─── SLA map (severity → human description) ──────────────────────────────────

const SLA_MAP: Record<string, { label: string; resolution: string; color: string }> = {
  P0: { label: 'P0 — Informação',  resolution: '5 dias úteis',  color: 'text-muted-foreground/70' },
  P1: { label: 'P1 — Baixo',       resolution: '3 dias úteis',  color: 'text-blue-400' },
  P2: { label: 'P2 — Médio',       resolution: '1 dia útil',    color: 'text-yellow-400' },
  P3: { label: 'P3 — Crítico',     resolution: '4 horas',       color: 'text-red-400' },
};

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Empresa & Contato' },
  { label: 'Tipo & Prioridade' },
  { label: 'Contexto Op.' },
  { label: 'Descrição' },
  { label: 'Anexos' },
  { label: 'SLA & Agenda' },
  { label: 'Revisão & Envio' },
];

// ─── Wizard ───────────────────────────────────────────────────────────────────

const EMPTY_FORM: WizardFormData = {
  company_name: '',
  company_id: null,
  unit_id: null,
  contact_id: null,
  company_cnpj: '',
  contact_email: '',
  contact_phone: '',
  comm_pref: '',
  requester: '',
  reporter_role: '',
  ticket_type: '',
  priority: 'medium',
  severity: '',
  impact: '',
  urgency: '',
  category: '',
  context_data: {},
  title: '',
  description: '',
  occurred_at: '',
  steps: { step1: '', step2: '', step3: '' },
  files: [],
  tags: [],
  assigned_to: '',
  team_id: '',
  is_public: false,
  time_start: '',
  time_end: '',
  tagInput: '',
};

export function CreateTicketWizard({
  open,
  onOpenChange,
  onCreated,
  agents = [],
  teams = [],
  companies = [],
}: CreateTicketWizardProps) {
  const [step, setStep]             = useState(0);
  // Qual campo barrou o avanço. O aviso no rodapé existia, mas ficava longe do
  // campo: quem olhava o formulário não via exigência nenhuma, só um asterisco.
  const [campoEmFalta, setCampoEmFalta] = useState<string | null>(null);
  const [form, setForm]             = useState<WizardFormData>(EMPTY_FORM);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const [aiPriority, setAiPriority] = useState<{ priority: string; score: number } | null>(null);
  const [kbSuggestions, setKbSuggestions] = useState<Array<{ id: string; title: string; slug: string; category: string }>>([]);
  const [kbLoading, setKbLoading]   = useState(false);

  const descRef    = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-priority: debounce call when impact/urgency/company change ──────────
  useEffect(() => {
    if (!form.impact || form.impact === 'none-clear') {
      setAiPriority(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const json = await ticketsApi.suggestPriority({ impact: form.impact, urgency: form.urgency || null, companyId: form.company_id });
        setAiPriority(json.data ?? null);
      } catch { /* silent */ }
    }, 400);
    return () => clearTimeout(t);
  }, [form.impact, form.urgency, form.company_id]);

  // ── KB suggestions: use kbApi.suggest when entering Review step with a title ─
  useEffect(() => {
    if (step !== 6 || !form.title.trim()) {
      setKbSuggestions([]);
      return;
    }
    setKbLoading(true);
    kbApi.suggest(form.title.trim(), 3)
      .then(data => {
        const articles = data?.articles ?? [];
        setKbSuggestions(
          articles.map(a => ({
            id: a.id,
            title: a.title,
            slug: '', // KbSuggestResult has no slug — build from id as fallback
            category: a.category ?? '',
          }))
        );
      })
      .catch(() => {})
      .finally(() => setKbLoading(false));
  }, [step, form.title]);

  const set = <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // ── Tag helpers ──────────────────────────────────────────────────────────
  const addTag = () => {
    const parts = form.tagInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const newTags = parts.filter(t => !form.tags.includes(t));
    if (newTags.length) setForm(prev => ({ ...prev, tags: [...prev.tags, ...newTags] }));
    set('tagInput', '');
  };

  const removeTag = (tag: string) =>
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));

  // ── File helpers ─────────────────────────────────────────────────────────
  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList);
    setForm(prev => ({ ...prev, files: [...prev.files, ...arr] }));
  };

  const removeFile = (idx: number) =>
    setForm(prev => ({ ...prev, files: prev.files.filter((_, i) => i !== idx) }));

  // ── Clipboard paste for description images ────────────────────────────────
  const handleDescPaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    setPasteFlash(true);
    setTimeout(() => setPasteFlash(false), 1200);
    const file = imageItem.getAsFile();
    if (!file) return;
    // Colar imagem exigia uma URL pública devolvida por `POST /upload`, que é
    // stub. Sem rota de upload avulso (o anexo pertence a um chamado que ainda
    // não existe neste ponto), o caminho honesto é somar o arquivo à lista de
    // anexos do passo 4, que sobe junto com o chamado.
    setForm(prev => ({ ...prev, files: [...prev.files, file] }));
  }, []);

  // ── Context step skip logic ───────────────────────────────────────────────
  // Step 2 is the "Contexto Operacional" step — skip if no fields for category
  const contextFields = getContextFields(form.category);
  const hasContextStep = contextFields.length > 0;

  // ── Validation per step ───────────────────────────────────────────────────
  const validate = (): boolean => {
    setError('');
    setCampoEmFalta(null);
    // Exige o VÍNCULO, não o nome. Aceitar texto solto aqui é o que encheu o
    // cadastro de variações da mesma empresa — ver lib/empresas.ts.
    if (step === 0 && !form.company_id) {
      setError('Escolha uma empresa cadastrada na lista. Se ela não existe ainda, cadastre em Empresas.');
      return false;
    }
    // WhatsApp OBRIGATÓRIO: é por ele que o cliente recebe o número do chamado
    // e o código de acompanhamento. Sem número, o chamado nasce mudo para quem
    // pediu — que é o que acontecia antes de 04/09/2026.
    if (step === 0) {
      const digitos = String(form.contact_phone || '').replace(/\D/g, '');
      if (!digitos) {
        setError('Informe o WhatsApp do cliente — é por ele que sai o código de acompanhamento.');
        setCampoEmFalta('contact_phone');
        return false;
      }
      // 10 a 13: com ou sem o 55 na frente. O suporte cola direto do WhatsApp,
      // e de lá vem sempre com DDI — recusar isso obrigaria a apagar dígito a
      // mão, que é como o hábito de redigitar (e o erro de digitação) volta.
      if (!telefoneCompleto(form.contact_phone)) {
        setError('WhatsApp incompleto. Use DDD + número (colar com o 55 na frente também vale).');
        setCampoEmFalta('contact_phone');
        return false;
      }
    }
    // Step 3 is description (index shifted by +1 due to context step)
    if (step === 3 && (!form.title.trim() || !form.description.trim())) {
      setError('Título e descrição são obrigatórios.');
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validate()) return;
    const next = step + 1;
    // Skip context step (step 2) if no fields for the selected category
    if (next === 2 && !hasContextStep) {
      setStep(3);
    } else {
      setStep(Math.min(next, STEPS.length - 1));
    }
  };

  const goBack = () => {
    setError('');
    const prev = step - 1;
    // Skip context step (step 2) when going back if no fields
    if (prev === 2 && !hasContextStep) {
      setStep(1);
    } else {
      setStep(Math.max(prev, 0));
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    setError('');
    try {
      // Append context data as structured block to description (no new DB columns needed)
      const contextBlock = formatContextBlock(form.context_data, form.category);
      let finalDescription = form.description.trim() + contextBlock;

      // Reporter role
      if (form.reporter_role) {
        const roleLabel = form.reporter_role.charAt(0).toUpperCase() + form.reporter_role.slice(1);
        finalDescription += `\n\n[Quem Reportou]\nCargo: ${roleLabel}${form.requester.trim() ? ` — ${form.requester.trim()}` : ''}`;
      }

      // Reproduction steps
      const filledSteps = [form.steps.step1, form.steps.step2, form.steps.step3].filter(s => s.trim());
      if (filledSteps.length > 0) {
        finalDescription += '\n\n[Etapas de Reprodução]';
        filledSteps.forEach((s, i) => { finalDescription += `\n${i + 1}. ${s.trim()}`; });
      }

      // Time tracking
      if (form.time_start || form.time_end) {
        const diff = form.time_start && form.time_end
          ? new Date(form.time_end).getTime() - new Date(form.time_start).getTime()
          : 0;
        const totalMin = diff > 0 ? Math.floor(diff / 60000) : 0;
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        const total = totalMin > 0 ? (h > 0 ? `${h}h ${m.toString().padStart(2, '0')}min` : `${m}min`) : '';
        const startStr = form.time_start ? formatDate(form.time_start) : '?';
        const endStr   = form.time_end   ? formatDate(form.time_end)   : '?';
        finalDescription += `\n\n[Controle de Tempo]\nInício: ${startStr}\nFim: ${endStr}${total ? `\nTotal: ${total}` : ''}`;
      }

      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: finalDescription,
        priority: form.priority,
        tags: form.tags,
        company_name: form.company_name.trim(),
        is_public: form.is_public,
      };
      // FK associations (Sprint 1 deep integration)
      if (form.company_id)            body.company_id = form.company_id;
      if (form.unit_id)               body.unit_id = form.unit_id;
      if (form.company_cnpj.trim())   body.company_cnpj = form.company_cnpj.trim();
      if (form.contact_email.trim())  body.contact_email = form.contact_email.trim();
      // `String(... || '')` de propósito: o campo é novo, e formulário meio
      // preenchido de antes da mudança chega sem ele. Foi assim que este
      // arquivo derrubou a criação de chamado em 04/09 — `undefined.trim()`.
      const _fone = String(form.contact_phone || '').trim();
      if (_fone)                      body.contact_phone = _fone;
      if (form.comm_pref)             body.comm_pref = form.comm_pref;
      if (form.requester.trim())      body.requester = form.requester.trim();
      if (form.ticket_type)           body.ticket_type = form.ticket_type;
      if (form.severity && form.severity !== 'none-clear') body.severity = form.severity;
      if (form.impact  && form.impact  !== 'none-clear')  body.impact = form.impact;
      if (form.urgency && form.urgency !== 'none-clear')  body.urgency = form.urgency;
      if (form.category.trim())       body.category = form.category.trim();
      if (form.occurred_at)           body.occurred_at = new Date(form.occurred_at).toISOString();
      if (form.team_id && form.team_id !== 'none')         body.team_id = form.team_id;

      let created: any;
      try {
        const json = await ticketsApi.create(body);
        created = json.data ?? json;
      } catch (err: any) {
        setError(err?.message ?? 'Erro ao criar ticket.');
        return;
      }

      // Assign agent if selected
      if (form.assigned_to && form.assigned_to !== 'none-unassigned' && created.id) {
        await ticketsApi.assign(created.id, form.assigned_to);
        const agent = agents.find(a => a.id === form.assigned_to);
        created.assignee = agent ? { id: agent.id, full_name: agent.full_name, email: agent.email } : null;
        created.assigned_to = form.assigned_to;
      }

      // Os anexos iam para `POST /upload`, um stub 501 — e o `.catch(() => {})`
      // engolia a falha, então o chamado nascia sem os arquivos que a pessoa
      // acabara de escolher, sem aviso nenhum. Agora vai pela rota que existe,
      // e o que falhar é dito.
      if (form.files.length > 0 && created.id) {
        const recusados: string[] = [];
        for (const file of form.files) {
          try {
            await anexarAoChamado(created.id, file);
          } catch (e) {
            recusados.push(`${file.name} (${e instanceof Error ? e.message : 'falhou'})`);
          }
        }
        if (recusados.length) {
          setError(`Chamado criado, mas estes anexos não subiram: ${recusados.join('; ')}`);
        }
      }

      const normalized = {
        ...created,
        user: created.user ?? null,
        assignee: created.assignee ?? null,
        message_count: 0,
        attachment_count: form.files.length,
        sla: null,
        created_at: created.created_at ?? created.createdAt ?? new Date().toISOString(),
        updated_at: created.updated_at ?? created.updatedAt ?? new Date().toISOString(),
        is_public: created.is_public ?? created.isPublic ?? form.is_public,
        ticket_number: created.ticket_number ?? created.ticketNumber ?? null,
        ticket_type: created.ticket_type ?? created.ticketType ?? null,
        company_name: created.company_name ?? created.companyName ?? form.company_name.trim(),
        company_cnpj: created.company_cnpj ?? created.companyCnpj ?? (form.company_cnpj.trim() || null),
        contact_email: created.contact_email ?? created.contactEmail ?? (form.contact_email.trim() || null),
        requester: created.requester ?? (form.requester.trim() || null),
      };

      onCreated?.(normalized);
      onOpenChange(false);
      resetForm();
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setStep(0);
    setError('');
    setDragOver(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  // ── Step renderers ────────────────────────────────────────────────────────

  const handleCompanyChange = (update: Partial<CompanySelectionUpdate>) => {
    setForm(prev => ({ ...prev, ...update }));
  };

  const renderStep0 = () => (
    <div className="space-y-4">
      <CompanySelector
        companyId={form.company_id}
        companyName={form.company_name}
        unitId={form.unit_id}
        contactId={form.contact_id}
        onChange={handleCompanyChange}
      />

      <Field label="CNPJ" hint="(opcional)">
        <Input
          value={form.company_cnpj}
          onChange={e => set('company_cnpj', e.target.value)}
          placeholder="00.000.000/0001-00"
          className="border-border bg-background text-foreground placeholder:text-muted-foreground"
        />
      </Field>

      <Field label="E-mail de contato">
        <Input
          type="email"
          value={form.contact_email}
          onChange={e => set('contact_email', e.target.value)}
          placeholder="cliente@empresa.com"
          className="border-border bg-background text-foreground placeholder:text-muted-foreground"
        />
      </Field>

      {/* O WhatsApp do cliente é o que faz o chamado ser acompanhável: é por
          ele que sai o número do chamado e o código de acompanhamento. Sem
          isto, chamado aberto pelo atendimento nascia mudo para quem pediu. */}
      <Field label="WhatsApp do cliente *" hint="(obrigatório — é por ele que sai o número do chamado e o código de acompanhamento)">
        <Input
          type="tel"
          value={form.contact_phone ?? ''}
          onChange={e => { set('contact_phone', mascaraTelefone(e.target.value)); if (campoEmFalta === 'contact_phone') setCampoEmFalta(null); }}
          placeholder="+55 (00) 00000-0000"
          maxLength={20}
          aria-invalid={campoEmFalta === 'contact_phone'}
          className={`bg-background text-foreground placeholder:text-muted-foreground ${
            campoEmFalta === 'contact_phone'
              ? 'border-sem-error-bd ring-1 ring-sem-error-bd'
              : 'border-border'
          }`}
        />
        {campoEmFalta === 'contact_phone' && (
          <p className="mt-1 text-xs text-sem-error-fg">
            Sem o WhatsApp o chamado nasce mudo: o cliente não recebe o número nem o código para acompanhar.
          </p>
        )}
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-muted-foreground/50">Solicitante <span className="ml-1 text-[11px] font-normal text-muted-foreground">(nome de quem abriu o chamado)</span></Label>
          <Input
            value={form.requester}
            onChange={e => set('requester', e.target.value)}
            placeholder="Nome completo"
            className="border-border bg-background text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground/50">Cargo</Label>
          <Select value={form.reporter_role} onValueChange={v => set('reporter_role', v)}>
            <SelectTrigger className="border-border bg-background text-foreground">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="border-border bg-background text-foreground">
              <SelectItem value="fiscal">Fiscal</SelectItem>
              <SelectItem value="gerente">Gerente</SelectItem>
              <SelectItem value="operador">Operador</SelectItem>
              <SelectItem value="administrativo">Administrativo</SelectItem>
              <SelectItem value="ti">TI</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Field label="Canal de comunicação preferido">
        <CardSelector
          options={[
            { value: 'email',     emoji: '📧', label: 'E-mail' },
            { value: 'phone',     emoji: '📞', label: 'Telefone' },
            { value: 'whatsapp',  emoji: '💬', label: 'WhatsApp' },
            { value: 'chat',      emoji: '🖥️', label: 'Chat' },
          ]}
          value={form.comm_pref as any}
          onChange={v => set('comm_pref', v)}
          cols={4}
        />
      </Field>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-5">
      <Field label="Tipo do ticket">
        <CardSelector
          options={[
            { value: 'bug',       emoji: '🐛', label: 'Bug',       desc: 'Comportamento errado' },
            { value: 'suporte',   emoji: '💡', label: 'Suporte',   desc: 'Auxílio operacional' },
            { value: 'duvida',    emoji: '❓', label: 'Dúvida',    desc: 'Esclarecimento' },
            { value: 'incidente', emoji: '⚡', label: 'Incidente', desc: 'Indisponibilidade' },
            { value: 'evolucao',  emoji: '🔄', label: 'Evolução',  desc: 'Melhoria solicitada' },
          ]}
          value={form.ticket_type as any}
          onChange={v => set('ticket_type', v)}
          cols={3}
        />
      </Field>

      <Field label="Prioridade">
        <CardSelector
          options={PRIORITY_KEYS.map((k) => ({ value: k, emoji: getPriorityEmoji(k), label: PRIORITY_LABELS[k] }))}
          value={form.priority as any}
          onChange={v => set('priority', v)}
          cols={5}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground/50">Severidade</Label>
          <Select value={form.severity} onValueChange={v => set('severity', v)}>
            <SelectTrigger className="border-border bg-background text-foreground">
              <SelectValue placeholder="Nenhuma" />
            </SelectTrigger>
            <SelectContent className="border-border bg-background text-foreground">
              <SelectItem value="none-clear">— Nenhuma</SelectItem>
              <SelectItem value="P0">P0 — Informação</SelectItem>
              <SelectItem value="P1">P1 — Baixo</SelectItem>
              <SelectItem value="P2">P2 — Médio</SelectItem>
              <SelectItem value="P3">P3 — Crítico</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground/50">Impacto no negócio</Label>
          <Select value={form.impact} onValueChange={v => set('impact', v)}>
            <SelectTrigger className="border-border bg-background text-foreground">
              <SelectValue placeholder="Não definido" />
            </SelectTrigger>
            <SelectContent className="border-border bg-background text-foreground">
              <SelectItem value="none-clear">— Não definido</SelectItem>
              <SelectItem value="low">🟢 Baixo</SelectItem>
              <SelectItem value="medium">🟡 Médio</SelectItem>
              <SelectItem value="high">🟠 Alto</SelectItem>
              <SelectItem value="critical">🔴 Crítico</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground/50">
          Urgência <span className="ml-1 text-[11px] font-normal text-muted-foreground">(com que rapidez precisa ser resolvido)</span>
        </Label>
        <Select value={form.urgency} onValueChange={v => set('urgency', v)}>
          <SelectTrigger className="border-border bg-background text-foreground">
            <SelectValue placeholder="Não definida" />
          </SelectTrigger>
          <SelectContent className="border-border bg-background text-foreground">
            <SelectItem value="none-clear">— Não definida</SelectItem>
            <SelectItem value="low">🟢 Baixa — pode aguardar</SelectItem>
            <SelectItem value="medium">🟡 Média — nas próximas horas</SelectItem>
            <SelectItem value="high">🟠 Alta — o mais rápido possível</SelectItem>
            <SelectItem value="critical">🔴 Crítica — parada total agora</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Auto-priority suggestion */}
      {aiPriority && (
        <div className="flex items-center gap-2 rounded-md border border-status-migration-bd bg-status-migration/40 px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 text-status-migration-fg shrink-0" />
          <p className="text-xs text-status-migration-fg">
            Prioridade sugerida pela matriz:{' '}
            <span className={cn(
              'font-semibold',
              aiPriority.priority === 'urgent' ? 'text-sem-error-fg' :
              aiPriority.priority === 'high'   ? 'text-priority-high-fg' :
              aiPriority.priority === 'medium' ? 'text-sem-warning-fg' : 'text-muted-foreground/50',
            )}>
              {getPriorityLabel(aiPriority.priority)}
            </span>
            <span className="ml-1 text-[10px] text-muted-foreground">(score {aiPriority.score})</span>
          </p>
        </div>
      )}

      <Field label="Categoria" hint="(ex: financeiro, acesso…)">
        <Input
          value={form.category}
          onChange={e => set('category', e.target.value)}
          placeholder="Ex: fiscal, PDV, financeiro…"
          className="border-border bg-background text-foreground placeholder:text-muted-foreground"
        />
      </Field>
    </div>
  );

  const renderStepContext = () => {
    const fields = getContextFields(form.category);
    const setCtx = (key: string, value: string) =>
      setForm(prev => ({ ...prev, context_data: { ...prev.context_data, [key]: value } }));

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-status-migration-bd bg-status-migration/30 px-4 py-3">
          <p className="text-xs font-medium text-status-migration-fg">
            Contexto operacional para categoria: <span className="font-bold">{form.category}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
            Preencha os dados específicos para agilizar o diagnóstico técnico.
          </p>
        </div>

        {fields.map(field => {
          const value = form.context_data[field.key] ?? '';

          if (field.type === 'select') {
            return (
              <Field key={field.key} label={field.label} required={field.required}>
                <Select value={value} onValueChange={v => setCtx(field.key, v)}>
                  <SelectTrigger className="border-border bg-background text-foreground">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-background text-foreground">
                    {field.options.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            );
          }

          if (field.type === 'textarea') {
            return (
              <Field key={field.key} label={field.label} required={field.required}>
                <Textarea
                  value={value}
                  onChange={e => setCtx(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={4}
                  className="border-border bg-background text-foreground placeholder:text-muted-foreground"
                />
              </Field>
            );
          }

          // type === 'text'
          return (
            <Field key={field.key} label={field.label} required={field.required} hint={field.required ? undefined : '(opcional)'}>
              <Input
                value={value}
                onChange={e => setCtx(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="border-border bg-background text-foreground placeholder:text-muted-foreground"
              />
            </Field>
          );
        })}
      </div>
    );
  };

  const QUICK_FILL_CHIPS = [
    'PDV não imprime NFC-e',
    'Nota fiscal em duplicidade',
    'Sistema lento',
    'Relatório não gera',
    'Sincronização NFC-e falhou',
    'Fechamento de caixa falhou',
    'Tirou dúvida',
    'Solicitou instalação/treinamento',
  ];

  const STEP_TEMPLATES = [
    ['Verificou versão do sistema?', 'Solicitou reinicialização?', 'Acesso remoto realizado?', 'Erro reportado pelo cliente'],
    ['Reinstalação feita', 'Configuração ajustada', 'Atualização aplicada', 'Parametrização revisada'],
    ['Sistema normalizado', 'Cliente confirmou resolução', 'Aguardando retorno', 'Pendente verificação'],
  ];

  const renderStep2 = () => (
    <div className="space-y-4">
      <Field label="Título" required>
        <Input
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Resumo objetivo do problema…"
          className="border-border bg-background text-foreground placeholder:text-muted-foreground"
          autoFocus
        />
      </Field>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground/50 flex items-center justify-between">
          <span>Descrição <span className="text-sem-error-fg">*</span></span>
          <span className="text-[10px] font-normal text-muted-foreground">Cole imagens com Ctrl+V</span>
        </Label>
        {/* Quick-fill chips */}
        <div className="flex flex-wrap gap-1.5 pb-1">
          {QUICK_FILL_CHIPS.map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => set('description', form.description ? `${form.description}\n${chip}` : chip)}
              className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground/50 hover:border-indigo-500 hover:bg-indigo-900/30 hover:text-indigo-300 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
        <Textarea
          ref={descRef}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          onPaste={handleDescPaste}
          placeholder="Descreva o problema com detalhes, passos para reproduzir, comportamento esperado…"
          rows={4}
          className={cn(
            'border-border bg-muted/40 text-foreground placeholder:text-muted-foreground transition-all duration-300',
            pasteFlash && 'border-sem-info-bd ring-1 ring-sem-info-bd',
          )}
        />
        {pasteFlash && (
          <p className="text-[10px] text-sem-info-fg animate-pulse">Imagem detectada — fazendo upload...</p>
        )}
      </div>

      {/* Reproduction steps */}
      <div className="space-y-2">
        <Label className="text-muted-foreground/50">Etapas de reprodução <span className="ml-1 text-[11px] font-normal text-muted-foreground">(opcional)</span></Label>
        {(['step1', 'step2', 'step3'] as const).map((key, idx) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground/50">
                {idx + 1}
              </span>
              <div className="flex flex-wrap gap-1">
                {STEP_TEMPLATES[idx].map(tpl => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, steps: { ...prev.steps, [key]: tpl } }))}
                    className="rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground/70 hover:border-border hover:text-foreground transition-colors"
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              value={form.steps[key]}
              onChange={e => setForm(prev => ({ ...prev, steps: { ...prev.steps, [key]: e.target.value } }))}
              placeholder={`Passo ${idx + 1}…`}
              rows={2}
              className="border-border bg-background text-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>
        ))}
      </div>

      <Field label="Quando ocorreu?" hint="(data/hora do problema)">
        <Input
          type="datetime-local"
          value={form.occurred_at}
          onChange={e => set('occurred_at', e.target.value)}
          max={new Date().toISOString().slice(0, 16)}
          className="border-border bg-background text-foreground placeholder:text-muted-foreground"
        />
      </Field>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
          dragOver
            ? 'border-status-migration-bd bg-status-migration/20'
            : 'border-border bg-muted/40 hover:border-border',
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground/70">Arraste arquivos aqui ou clique para selecionar</p>
        <p className="text-xs text-foreground/60">Imagens, PDFs, documentos…</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {form.files.length > 0 && (
        <ul className="space-y-1.5">
          {form.files.map((f, i) => (
            <li key={i} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5">
              <span className="text-xs text-muted-foreground/50 truncate max-w-xs">{f.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-sem-error-fg">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Tags */}
      <Field label="Tags" hint="(separe por vírgula)">
        <div className="flex gap-2">
          <Input
            value={form.tagInput}
            onChange={e => set('tagInput', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="financeiro, acesso, NF-e…"
            className="border-border bg-background text-foreground placeholder:text-muted-foreground"
          />
          <Button type="button" size="sm" variant="outline" onClick={addTag}
            className="border-border bg-background text-foreground hover:bg-muted">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {form.tags.map(tag => (
              <Badge key={tag} variant="outline" className="gap-1 border-border text-muted-foreground/50">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-sem-error-fg">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </Field>
    </div>
  );

  const renderStep4 = () => {
    const sla = form.severity && form.severity !== 'none-clear' ? SLA_MAP[form.severity] : null;

    const calcTimeTotal = (): string => {
      if (!form.time_start || !form.time_end) return '';
      const diff = new Date(form.time_end).getTime() - new Date(form.time_start).getTime();
      if (diff <= 0) return '';
      const totalMin = Math.floor(diff / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}min` : `${m}min`;
    };

    const timeTotal = calcTimeTotal();
    const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    return (
      <div className="space-y-5">
        {/* SLA Preview */}
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-status-migration-fg" />
            <span className="text-sm font-medium text-foreground">Previsão de SLA</span>
          </div>
          {sla ? (
            <div className="space-y-1">
              <p className={cn('text-sm font-semibold', sla.color)}>{sla.label}</p>
              <p className="text-xs text-muted-foreground/70">Resolução esperada: <span className="text-foreground font-medium">{sla.resolution}</span></p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-sem-warning-fg" />
              Defina a severidade na Etapa 2 para ver a previsão de SLA.
            </p>
          )}
        </div>

        {/* Assignee */}
        <Field label="Responsável">
          <Select value={form.assigned_to} onValueChange={v => set('assigned_to', v)}>
            <SelectTrigger className="border-border bg-background text-foreground">
              <SelectValue placeholder="Atribuir a…" />
            </SelectTrigger>
            <SelectContent className="border-border bg-background text-foreground">
              <SelectItem value="none-unassigned">— Sem responsável</SelectItem>
              {agents.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name || a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Team */}
        {teams.length > 0 && (
          <Field label="Time / Fila">
            <Select value={form.team_id} onValueChange={v => set('team_id', v)}>
              <SelectTrigger className="border-border bg-background text-foreground">
                <SelectValue placeholder="Nenhum time" />
              </SelectTrigger>
              <SelectContent className="border-border bg-background text-foreground">
                <SelectItem value="none">— Nenhum time</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* Public */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <Checkbox
            id="wizard-is-public"
            checked={form.is_public}
            onCheckedChange={v => set('is_public', !!v)}
            className="border-border data-[state=checked]:bg-status-migration-fg data-[state=checked]:border-status-migration-fg"
          />
          <label htmlFor="wizard-is-public" className="cursor-pointer space-y-0.5">
            <p className="text-sm text-foreground">Ticket visível ao cliente</p>
            <p className="text-xs text-muted-foreground">O solicitante poderá acompanhar o andamento pelo portal.</p>
          </label>
        </div>

        {/* Time tracking */}
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-status-migration-fg" />
            <span className="text-sm font-medium text-foreground">Controle de tempo</span>
            <span className="text-[11px] text-muted-foreground">(opcional)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground/70">Início do atendimento</Label>
              <div className="flex gap-1">
                <Input
                  type="datetime-local"
                  value={form.time_start}
                  onChange={e => set('time_start', e.target.value)}
                  className="border-border bg-background text-foreground text-xs flex-1"
                />
                <button
                  type="button"
                  onClick={() => set('time_start', nowLocal())}
                  className="shrink-0 rounded border border-border bg-muted px-2 text-[10px] text-muted-foreground/50 hover:bg-muted transition-colors"
                >
                  Agora
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground/70">Fim do atendimento</Label>
              <div className="flex gap-1">
                <Input
                  type="datetime-local"
                  value={form.time_end}
                  onChange={e => set('time_end', e.target.value)}
                  className="border-border bg-background text-foreground text-xs flex-1"
                />
                <button
                  type="button"
                  onClick={() => set('time_end', nowLocal())}
                  className="shrink-0 rounded border border-border bg-muted px-2 text-[10px] text-muted-foreground/50 hover:bg-muted transition-colors"
                >
                  Agora
                </button>
              </div>
            </div>
          </div>
          {timeTotal && (
            <p className="text-sm text-status-migration-fg font-medium">
              ⏱ Tempo total: {timeTotal}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderStep5 = () => {
    const typeLabels: Record<string, string> = {
      bug: 'Bug', suporte: 'Suporte', duvida: 'Dúvida', incidente: 'Incidente', evolucao: 'Evolução',
    };
    const priorityLabels: Record<string, string> = PRIORITY_LABELS;
    const impactLabels: Record<string, string> = {
      low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico',
    };
    const commLabels: Record<string, string> = {
      email: 'E-mail', phone: 'Telefone', whatsapp: 'WhatsApp', chat: 'Chat',
    };
    const assignee = agents.find(a => a.id === form.assigned_to);
    const team     = teams.find(t => t.id === form.team_id);

    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Revise os dados antes de enviar. Clique no lápis para editar cada seção.</p>

        {/* Section: Empresa & Contato */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-status-migration-fg uppercase tracking-wide">Empresa & Contato</span>
            <button type="button" onClick={() => setStep(0)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-status-migration-fg">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </div>
          <ReviewRow label="Empresa"    value={form.company_name} />
          <ReviewRow label="CNPJ"       value={form.company_cnpj} />
          <ReviewRow label="E-mail"     value={form.contact_email} />
          <ReviewRow label="WhatsApp"   value={form.contact_phone} />
          <ReviewRow label="Solicitante" value={form.reporter_role ? `${form.reporter_role.charAt(0).toUpperCase() + form.reporter_role.slice(1)}${form.requester ? ` — ${form.requester}` : ''}` : form.requester} />
          <ReviewRow label="Canal"      value={form.comm_pref ? commLabels[form.comm_pref] ?? form.comm_pref : ''} />
        </div>

        {/* Section: Tipo & Prioridade */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-status-migration-fg uppercase tracking-wide">Tipo & Prioridade</span>
            <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-status-migration-fg">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </div>
          <ReviewRow label="Tipo"       value={form.ticket_type ? typeLabels[form.ticket_type] ?? form.ticket_type : ''} />
          <ReviewRow label="Prioridade" value={priorityLabels[form.priority] ?? form.priority} />
          <ReviewRow label="Severidade" value={form.severity && form.severity !== 'none-clear' ? form.severity : ''} />
          <ReviewRow label="Impacto"    value={form.impact && form.impact !== 'none-clear' ? impactLabels[form.impact] ?? form.impact : ''} />
          <ReviewRow label="Categoria"  value={form.category} />
        </div>

        {/* Section: Descrição */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-status-migration-fg uppercase tracking-wide">Descrição</span>
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-status-migration-fg">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </div>
          <ReviewRow label="Título"     value={form.title} />
          <ReviewRow label="Descrição"  value={form.description.length > 120 ? form.description.slice(0, 120) + '…' : form.description} />
          <ReviewRow label="Ocorreu em" value={form.occurred_at ? formatDate(form.occurred_at) : ''} />
        </div>

        {/* Section: Etapas de Reprodução */}
        {(form.steps.step1 || form.steps.step2 || form.steps.step3) && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-0.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-status-migration-fg uppercase tracking-wide">Etapas de Reprodução</span>
              <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-status-migration-fg">
                <Pencil className="h-3 w-3" /> Editar
              </button>
            </div>
            {form.steps.step1 && <ReviewRow label="Passo 1" value={form.steps.step1} />}
            {form.steps.step2 && <ReviewRow label="Passo 2" value={form.steps.step2} />}
            {form.steps.step3 && <ReviewRow label="Passo 3" value={form.steps.step3} />}
          </div>
        )}

        {/* Section: Contexto Operacional (show only if context was provided) */}
        {Object.keys(form.context_data).some(k => form.context_data[k]?.trim()) && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-0.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-status-migration-fg uppercase tracking-wide">Contexto Operacional</span>
              <button type="button" onClick={() => setStep(2)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-status-migration-fg">
                <Pencil className="h-3 w-3" /> Editar
              </button>
            </div>
            {Object.entries(form.context_data)
              .filter(([, v]) => v?.trim())
              .map(([k, v]) => {
                const fields = getContextFields(form.category);
                const label = fields.find(f => f.key === k)?.label ?? k;
                return <ReviewRow key={k} label={label} value={v} />;
              })}
          </div>
        )}

        {/* Section: Anexos */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-status-migration-fg uppercase tracking-wide">Anexos & Tags</span>
            <button type="button" onClick={() => setStep(4)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-status-migration-fg">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </div>
          <ReviewRow label="Arquivos"   value={form.files.length > 0 ? `${form.files.length} arquivo${form.files.length !== 1 ? 's' : ''}` : ''} />
          <ReviewRow label="Tags"       value={form.tags.join(', ')} />
        </div>

        {/* Section: SLA & Agenda */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-status-migration-fg uppercase tracking-wide">SLA & Agendamento</span>
            <button type="button" onClick={() => setStep(5)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-status-migration-fg">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </div>
          <ReviewRow label="Responsável" value={assignee ? assignee.full_name ?? assignee.email : ''} />
          <ReviewRow label="Time"        value={team?.name ?? ''} />
          <ReviewRow label="Visibilidade" value={form.is_public ? 'Público (cliente pode ver)' : 'Privado (apenas equipe)'} />
          {(form.time_start || form.time_end) && (() => {
            const diff = form.time_start && form.time_end ? new Date(form.time_end).getTime() - new Date(form.time_start).getTime() : 0;
            const totalMin = diff > 0 ? Math.floor(diff / 60000) : 0;
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            const total = totalMin > 0 ? (h > 0 ? `${h}h ${m.toString().padStart(2, '0')}min` : `${m}min`) : '';
            return (
              <ReviewRow
                label="Tempo atend."
                value={`${form.time_start ? formatDate(form.time_start) : '?'} → ${form.time_end ? formatDate(form.time_end) : '?'}${total ? ` (${total})` : ''}`}
              />
            );
          })()}
        </div>

        {/* Section: KB Suggestions */}
        {(kbLoading || kbSuggestions.length > 0) && (
          <div className="rounded-lg border border-sem-warning-bd bg-sem-warning/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-sem-warning-fg shrink-0" />
              <span className="text-xs font-semibold text-sem-warning-fg uppercase tracking-wide">Artigos KB relacionados</span>
            </div>
            {kbLoading ? (
              <p className="text-[11px] text-muted-foreground animate-pulse">Buscando artigos…</p>
            ) : (
              <ul className="space-y-1">
                {kbSuggestions.map(a => (
                  <li key={a.id} className="flex items-start gap-1.5">
                    <span className="text-sem-warning-fg mt-0.5">•</span>
                    <a
                      href={a.slug ? `/admin/knowledge/${a.slug}` : `/admin/knowledge/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-sem-warning-fg hover:opacity-80 hover:underline leading-snug"
                    >
                      {a.title}
                    </a>
                    {a.category && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{a.category}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-foreground/60">Verifique se o problema já está documentado antes de criar o ticket.</p>
          </div>
        )}
      </div>
    );
  };

  const stepContent = [
    renderStep0,
    renderStep1,
    renderStepContext,
    renderStep2,
    renderStep3,
    renderStep4,
    renderStep5,
  ];

  const isLastStep = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col overflow-hidden border-border bg-card text-foreground">
        <DialogHeader className="shrink-0 pb-4 border-b border-border">
          <DialogTitle className="text-foreground text-base">
            Novo chamado — {STEPS[step].label}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="shrink-0 pt-3 pb-4 border-b border-border">
          <StepperHeader current={step} />
        </div>

        {/* Step body */}
        <div className="flex-1 overflow-y-auto py-4 px-1">
          {stepContent[step]()}
        </div>

        {/* Error */}
        {error && (
          <p className="shrink-0 rounded bg-sem-error border border-sem-error-bd px-3 py-2 text-sm text-sem-error-fg mx-0 my-1">
            {error}
          </p>
        )}

        {/* Footer nav */}
        <div className="shrink-0 flex items-center justify-between pt-4 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 0 ? () => handleClose(false) : goBack}
            className="text-muted-foreground/70 hover:text-foreground gap-1.5"
            disabled={loading}
          >
            {step === 0 ? (
              'Cancelar'
            ) : (
              <><ChevronLeft className="h-4 w-4" /> Voltar</>
            )}
          </Button>

          <div className="text-xs text-foreground/60">{step + 1} / {STEPS.length}</div>

          {isLastStep ? (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="bg-status-migration-fg hover:opacity-90 gap-1.5"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando…</>
                : <><Check className="h-4 w-4" /> Criar Ticket</>
              }
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              className="bg-status-migration-fg hover:opacity-90 gap-1.5"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
