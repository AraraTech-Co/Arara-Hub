"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send, Loader2, Pencil, Check, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// =============================================================================
// TicketInternalComments — comentários da equipe (mensagens internas).
// =============================================================================
// Reaproveita a infraestrutura de TicketMessage com is_internal=true. Cliente
// NÃO vê esses comentários (filtrados no server pelos endpoints públicos).
//
// Diferença pro <TicketMessages> existente:
//   - Mostra APENAS as mensagens internas
//   - Form simplificado (não tem checkbox — já é internal por padrão)
//   - Visual de "thread interna da equipe" (cor diferente)
// =============================================================================

export type InternalComment = {
  id: string;
  message: string;
  created_at: string;
  user_id: string | null;
  /** Presente só quando o comentário foi editado FORA da janela de correção. */
  editado_em?: string | null;
  /** Texto anterior à primeira edição fora da janela. */
  texto_original?: string | null;
  user: {
    full_name: string | null;
    email: string;
    role: string;
  } | null;
};

/**
 * Janela de correção livre — espelha `scripts/comentario-editar.py`. Dentro
 * dela a edição não deixa marca: consertar o dedo trocado não merece virar
 * histórico. O servidor é quem decide; aqui é só para a tela avisar antes.
 */
const JANELA_MIN = 15;

interface Props {
  ticketId: string;
  comments: InternalComment[];
  currentUserId: string;
  /**
   * Chamado depois de enviar ou editar, para quem é dono da lista recarregá-la.
   * `router.refresh()` não recarrega nada num export estático: sem isto o
   * comentário novo só aparecia depois de um F5.
   */
  onChanged?: () => void;
  /**
   * Card do Dev escalado de um chamado: oferece "enviar também ao cliente",
   * que publica uma cópia no chamado de origem (item 2.2). Nulo = não oferece.
   */
  copiaOrigem?: { numero: string } | null;
}


// Comentário com HTML (colado de e-mail, editor rico) mostrava as tags cruas
// ("<p>…</p>") — aqui o formato é texto; as tags saem na exibição.
function semTags(texto: string): string {
  return texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function initials(name: string | null, email: string): string {
  const src = name?.trim() || email.split("@")[0];
  return src
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function TicketInternalComments({ ticketId, comments, currentUserId, onChanged, copiaOrigem }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviarCliente, setEnviarCliente] = useState(false);
  const recarregar = () => (onChanged ? onChanged() : router.refresh());

  // ─── Edição de comentário ──────────────────────────────────────────────
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [verOriginal, setVerOriginal] = useState<Record<string, boolean>>({});

  const dentroDaJanela = (criadoEm: string) => {
    const t = new Date(criadoEm).getTime();
    return Number.isFinite(t) && Date.now() - t < JANELA_MIN * 60 * 1000;
  };

  const abrirEdicao = (c: InternalComment) => {
    setEditandoId(c.id);
    setTextoEdicao(semTags(c.message));
    setErroEdicao(null);
  };

  const salvarEdicao = async (c: InternalComment) => {
    const message = textoEdicao.trim();
    if (!message || message === semTags(c.message)) {
      setEditandoId(null);
      return;
    }
    setSalvandoEdicao(true);
    setErroEdicao(null);
    try {
      const res = await araraApiFetch(`/api/tickets/${ticketId}/messages/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Falha ao salvar a edição");
      }
      setEditandoId(null);
      recarregar();
    } catch (err) {
      setErroEdicao(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const submit = async () => {
    const message = text.trim();
    if (!message) return;
    const paraCliente = !!copiaOrigem && enviarCliente;
    if (
      paraCliente &&
      !window.confirm(
        `Enviar este texto também ao cliente, no chamado ${copiaOrigem!.numero}?\n\nEle recebe o aviso de nova resposta.`,
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await araraApiFetch(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, is_internal: true, ...(paraCliente ? { copiar_para_origem: true } : {}) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Falha ao enviar comentário");
      }
      setText("");
      setEnviarCliente(false);
      recarregar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter envia
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-lg border border-sem-warning-bd bg-sem-warning/40 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-sem-warning-fg uppercase tracking-wide flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Comentários da equipe
          <span className="text-xs font-normal text-sem-warning-fg/70">
            (só visível para admin/agente)
          </span>
        </h2>
        {comments.length > 0 && (
          <span className="text-xs text-sem-warning-fg/70">
            {comments.length} {comments.length === 1 ? "comentário" : "comentários"}
          </span>
        )}
      </div>

      {/* Lista */}
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground italic mb-4">
          Nenhum comentário interno ainda. Use este espaço para registrar atividades, alinhar com colegas e contextualizar o caso.
        </p>
      ) : (
        <ul className="space-y-3 mb-4">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-sem-warning-bd bg-background px-3 py-2.5"
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-8 w-8 rounded-full bg-sem-warning text-sem-warning-fg flex items-center justify-center text-xs font-semibold">
                    {initials(c.user?.full_name ?? null, c.user?.email ?? "?")}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground/80">
                      {c.user?.full_name || c.user?.email || "Sistema"}
                    </span>
                    {c.user?.role && c.user.role !== "client" && (
                      <span className="text-[10px] uppercase tracking-wide text-sem-warning-fg bg-sem-warning px-1.5 py-0.5 rounded">
                        {c.user.role}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground/70">
                      {formatDate(c.created_at)}
                    </span>
                    {/* Editado NUNCA é silencioso: quem lê semanas depois
                        precisa saber que o texto mudou desde que foi escrito. */}
                    {c.editado_em && (
                      <span className="text-xs italic text-muted-foreground/70">
                        editado em {formatDate(c.editado_em)}
                      </span>
                    )}
                    {c.user_id && currentUserId && String(c.user_id) === String(currentUserId) &&
                      editandoId !== c.id && (
                        <button
                          type="button"
                          onClick={() => abrirEdicao(c)}
                          title={
                            dentroDaJanela(c.created_at)
                              ? `Corrigir sem deixar marca (até ${JANELA_MIN} min do envio)`
                              : "Editar — o texto atual fica guardado como original"
                          }
                          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar
                        </button>
                      )}
                  </div>

                  {editandoId === c.id ? (
                    <div className="mt-1.5 space-y-2">
                      <textarea
                        value={textoEdicao}
                        onChange={(e) => setTextoEdicao(e.target.value)}
                        autoFocus
                        className="w-full min-h-[70px] max-h-[300px] text-sm border border-sem-warning-bd rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-sem-warning-bd resize-y"
                      />
                      <p className="text-xs text-muted-foreground/70">
                        {dentroDaJanela(c.created_at)
                          ? `Ainda dentro dos ${JANELA_MIN} minutos: a correção não deixa marca.`
                          : "O texto atual será guardado como original, e o comentário fica marcado como editado."}
                      </p>
                      {erroEdicao && (
                        <p className="text-xs text-sem-error-fg bg-sem-error border border-sem-error-bd rounded px-2 py-1">
                          {erroEdicao}
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditandoId(null)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => salvarEdicao(c)}
                          disabled={salvandoEdicao || !textoEdicao.trim()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-background bg-sem-warning-fg hover:opacity-90 disabled:opacity-50 transition-colors"
                        >
                          {salvandoEdicao ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap mt-1">
                        {semTags(c.message)}
                      </p>
                      {/* O original fica acessível, não exposto: o que vale é o
                          texto atual; o anterior é para quem precisa conferir. */}
                      {c.texto_original && (
                        <div className="mt-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setVerOriginal((v) => ({ ...v, [c.id]: !v[c.id] }))
                            }
                            className="text-xs text-muted-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors"
                          >
                            {verOriginal[c.id] ? "ocultar original" : "ver original"}
                          </button>
                          {verOriginal[c.id] && (
                            <p className="mt-1 border-l-2 border-sem-warning-bd pl-2 text-sm italic text-muted-foreground whitespace-pre-wrap">
                              {semTags(c.texto_original)}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Form */}
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escreva um comentário para a equipe… (Ctrl/Cmd + Enter envia)"
          className="w-full min-h-[80px] max-h-[300px] text-sm border border-sem-warning-bd rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-sem-warning-bd focus:border-sem-warning-bd resize-y"
        />
        {error && (
          <p className="text-xs text-sem-error-fg bg-sem-error border border-sem-error-bd rounded px-2 py-1">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {copiaOrigem && (
            <label className="mr-auto flex items-center gap-2 text-xs text-foreground/80">
              <input
                type="checkbox"
                checked={enviarCliente}
                onChange={(e) => setEnviarCliente(e.target.checked)}
              />
              Enviar também ao cliente (chamado {copiaOrigem.numero})
            </label>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={sending || !text.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-background bg-sem-warning-fg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Comentar
          </button>
        </div>
      </div>
    </div>
  );
}
