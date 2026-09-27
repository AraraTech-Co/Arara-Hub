"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandInput,
  CommandItem, CommandList, CommandGroup,
} from "@/components/ui/command";
import { Send, ChevronDown, X, CornerUpLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from 'lucide-react';
import { RichMessageEditor, type AgentOption } from './rich-message-editor';
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface Template {
  id: string;
  name: string;
  content: string;
  category: string | null;
}

export interface ReplyTarget {
  id: string;
  preview: string;
  authorName: string;
}

interface MessageFormProps {
  ticketId: string;
  userId: string;
  isAdmin?: boolean;
  agents?: AgentOption[];
  replyTo?: ReplyTarget | null;
  onClearReply?: () => void;
}

export function MessageForm({
  ticketId,
  userId: _userId,
  isAdmin = false,
  agents = [],
  replyTo,
  onClearReply,
}: MessageFormProps) {
  const [message, setMessage]             = useState("");
  const [mentions, setMentions]           = useState<string[]>([]);
  const [isInternal, setIsInternal]       = useState(false);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [templates, setTemplates]         = useState<Template[]>([]);
  const [templateOpen, setTemplateOpen]   = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isAdmin) return;
    araraApiFetch('/api/templates')
      .then(r => r.json())
      .then(j => setTemplates(j.data ?? []))
      .catch(() => {});
  }, [isAdmin]);

  const applyTemplate = (t: Template) => {
    const current = message.replace(/<p><\/p>$/, '').trim();
    const appended = current
      ? `${current}<p>${t.content}</p>`
      : `<p>${t.content}</p>`;
    setMessage(appended);
    setTemplateOpen(false);
  };

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const key = t.category ?? 'Geral';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const isEmpty = !message || message === '<p></p>' || message.trim() === '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmpty) { setError("Por favor, digite uma mensagem"); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await araraApiFetch(`/api/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:      message.trim(),
          is_internal:  isAdmin ? isInternal : false,
          reply_to_id:  replyTo?.id ?? null,
          mentions,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Erro ao enviar mensagem');
      }
      setMessage("");
      // O modo interno NÃO persiste para a próxima mensagem: foi assim que
      // duas atualizações para o cliente sairam internas em sequência (21/08).
      setIsInternal(false);
      setMentions([]);
      setIsInternal(false);
      onClearReply?.();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Reply context banner */}
          {replyTo && (
            <div className="flex items-start gap-2 rounded-md border-l-2 border-indigo-400 bg-indigo-50/60 px-3 py-2">
              <CornerUpLeft className="h-3.5 w-3.5 text-indigo-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-indigo-600">{replyTo.authorName}</p>
                <p className="text-xs text-muted-foreground truncate">{replyTo.preview}</p>
              </div>
              {onClearReply && (
                <button type="button" onClick={onClearReply} className="text-muted-foreground/70 hover:text-foreground/60 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Rich editor */}
          <div className="relative">
            <RichMessageEditor
              value={message}
              onChange={setMessage}
              onMentionsChange={setMentions}
              agents={agents}
              disabled={isLoading}
              placeholder="Digite sua mensagem… (@nome para mencionar)"
            />
            {/* Template picker */}
            {isAdmin && templates.length > 0 && (
              <div className="mt-1 flex justify-end">
                <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground/70 hover:text-foreground/80"
                      title="Inserir template de resposta"
                    >
                      📋 Templates
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Buscar template…" className="h-8 text-sm" />
                      <CommandList className="max-h-64">
                        <CommandEmpty>Nenhum template encontrado.</CommandEmpty>
                        {Object.entries(grouped).map(([category, items]) => (
                          <CommandGroup key={category} heading={category}>
                            {items.map(t => (
                              <CommandItem
                                key={t.id}
                                value={t.name}
                                onSelect={() => applyTemplate(t)}
                                className="cursor-pointer text-sm py-2"
                              >
                                <span className="truncate">{t.name}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className={isInternal
              ? 'flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5'
              : 'flex items-center space-x-2'}>
              <Checkbox
                id="internal"
                checked={isInternal}
                onCheckedChange={(checked) => setIsInternal(checked as boolean)}
                disabled={isLoading}
              />
              <Label htmlFor="internal" className="text-sm cursor-pointer">
                {isInternal ? (
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    Vai para COMENTÁRIOS DA EQUIPE — o cliente não verá esta mensagem
                  </span>
                ) : (
                  <span className="text-foreground/60">Mensagem interna (só a equipe vê)</span>
                )}
              </Label>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isLoading || isEmpty}>
            <Send className="mr-2 h-4 w-4" />
            {isLoading ? "Enviando…" : "Enviar Mensagem"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
