'use client'

import { useState, useEffect } from "react";
import { useRotaDinamica } from "@/hooks/use-rota-dinamica";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Star, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingData {
  ticket_number: string | null;
  title: string;
  company_name: string | null;
  already_rated: boolean;
  score: number | null;
  comment: string | null;
}

export default function AvaliarPage() {
  const token = useRotaDinamica('token', 'avaliar');

  const [data, setData]           = useState<RatingData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [hover, setHover]         = useState(0);
  const [selected, setSelected]   = useState(0);
  const [comment, setComment]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return
    import('@/lib/arara/client')
      .then(({ arara }) => arara.rateGet(token))
      .then(j => {
        if ((j as any).error) { setError(String((j as any).error)); setLoading(false); return; }
        setData(j as RatingData);
        if ((j as RatingData).already_rated) setSubmitted(true);
        setLoading(false);
      })
      .catch(() => { setError("Erro ao carregar avaliação."); setLoading(false); });
  }, [token]);

  const handleSubmit = async () => {
    if (!selected || !token) return;
    setSubmitting(true);
    try {
      const { arara } = await import('@/lib/arara/client')
      await arara.ratePost(token, { score: selected, comment: comment.trim() || null })
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao enviar avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  const labels: Record<number, string> = {
    1: "Péssimo 😞",
    2: "Ruim 😕",
    3: "Regular 😐",
    4: "Bom 😊",
    5: "Excelente 🤩",
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
        <div className="mx-auto max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-sem-error-fg" />
          <h1 className="text-lg font-semibold text-foreground">Link inválido</h1>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-muted/50 to-blue-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-md">
            <Star className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Avalie nosso atendimento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua opinião nos ajuda a melhorar continuamente.
          </p>
        </div>

        {/* Ticket info */}
        {data && (
          <div className="mb-6 rounded-xl border border-border bg-background px-5 py-4 shadow-sm">
            {data.ticket_number && (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">
                #{data.ticket_number}
              </p>
            )}
            <p className="text-sm font-semibold text-foreground leading-snug">{data.title}</p>
            {data.company_name && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
                <Building2 className="h-3.5 w-3.5" />
                {data.company_name}
              </p>
            )}
          </div>
        )}

        {/* Submitted state */}
        {submitted ? (
          <div className="rounded-2xl border border-sem-success-bd bg-background px-8 py-10 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-500" />
            <h2 className="text-xl font-bold text-foreground">Obrigado!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sua avaliação foi registrada. Continuaremos trabalhando para oferecer o melhor suporte.
            </p>
            {data?.score && (
              <div className="mt-4 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star
                    key={s}
                    className={cn(
                      "h-7 w-7",
                      s <= (data.score ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted"
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Rating form */
          <div className="rounded-2xl border border-border bg-background px-6 py-8 shadow-sm space-y-6">
            {/* Stars */}
            <div className="text-center">
              <p className="mb-4 text-sm font-medium text-foreground/80">
                Como você avalia o atendimento recebido?
              </p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelected(s)}
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(0)}
                    className="group transition-transform hover:scale-110 focus:outline-none"
                    aria-label={`${s} estrela${s !== 1 ? "s" : ""}`}
                  >
                    <Star
                      className={cn(
                        "h-10 w-10 transition-colors",
                        s <= (hover || selected)
                          ? "fill-amber-400 text-amber-400"
                          : "fill-transparent text-border group-hover:text-amber-300"
                      )}
                    />
                  </button>
                ))}
              </div>
              {(hover || selected) > 0 && (
                <p className="mt-2 text-sm font-medium text-sem-warning-fg transition-all">
                  {labels[hover || selected]}
                </p>
              )}
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground/80">
                Comentário <span className="text-xs font-normal text-muted-foreground/70">(opcional)</span>
              </label>
              <Textarea
                placeholder="Conte o que achou do atendimento..."
                rows={3}
                value={comment}
                onChange={e => setComment(e.target.value)}
                className="resize-none text-sm"
              />
            </div>

            {error && (
              <p className="text-sm text-sem-error-fg flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}

            <Button
              className="w-full"
              disabled={!selected || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</>
              ) : (
                "Enviar avaliação"
              )}
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          Arara Tech · Portal de Suporte
        </p>
      </div>
    </div>
  );
}
