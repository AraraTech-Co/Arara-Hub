"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, MailOpen, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { formatDate, formatDateShort } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface Email {
  id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
  ticket: {
    id: string;
    title: string;
    status: string;
  } | null;
  user: {
    id: string;
    full_name: string | null;
    email: string;
  };
}

interface Ticket {
  id: string;
  title: string;
  status: string;
}

interface EmailListProps {
  emails: Email[];
  currentUserEmail: string;
  tickets: Ticket[];
}

export function EmailList({ emails, currentUserEmail, tickets }: EmailListProps) {
  const [filter, setFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const router = useRouter();

  const filteredEmails = emails.filter((email) => {
    if (filter === "unread") return !email.is_read;
    if (filter === "sent") return email.from_email === currentUserEmail;
    if (filter === "received") return email.to_email === currentUserEmail;
    return true;
  });

  const handleMarkAsRead = async (emailId: string) => {
    await araraApiFetch(`/api/emails/${emailId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: true }),
    });
    router.refresh();
  };

  const handleLinkTicket = async (emailId: string, ticketId: string) => {
    await araraApiFetch(`/api/emails/${emailId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId }),
    });
    router.refresh();
  };

  const openEmail = async (email: Email) => {
    setSelectedEmail(email);
    if (!email.is_read) {
      await handleMarkAsRead(email.id);
    }
  };

  if (!emails || emails.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>E-mails</CardTitle>
          <CardDescription>Nenhum e-mail encontrado</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Os e-mails aparecerão aqui quando forem enviados ou recebidos
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>E-mails</CardTitle>
              <CardDescription>
                {filteredEmails.length} e-mail{filteredEmails.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="unread">Não Lidos</SelectItem>
                <SelectItem value="received">Recebidos</SelectItem>
                <SelectItem value="sent">Enviados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredEmails.map((email) => {
              const isSent = email.from_email === currentUserEmail;

              return (
                <div
                  key={email.id}
                  className={`flex items-start gap-4 rounded-lg border p-4 transition-colors cursor-pointer hover:bg-muted/50 ${
                    !email.is_read && !isSent ? "bg-sem-info border-sem-info-bd" : "bg-background border-border"
                  }`}
                  onClick={() => openEmail(email)}
                >
                  <div className="mt-1">
                    {email.is_read || isSent ? (
                      <MailOpen className="h-5 w-5 text-muted-foreground/70" />
                    ) : (
                      <Mail className="h-5 w-5 text-blue-600" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-semibold text-sm ${!email.is_read && !isSent ? "text-foreground" : "text-foreground/80"}`}>
                            {email.subject}
                          </h3>
                          {isSent && (
                            <Badge variant="outline" className="text-xs bg-sem-success text-sem-success-fg">
                              Enviado
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-foreground/60">
                          {isSent ? `Para: ${email.to_email}` : `De: ${email.from_email}`}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-foreground/60">
                          {email.body}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(email.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {email.ticket ? (
                        <Link
                          href={`/admin/tickets/view/?id=${encodeURIComponent(email.ticket.id)}`}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ticket: {email.ticket.title}
                        </Link>
                      ) : (
                        <Select
                          value="none"
                          onValueChange={(value) => handleLinkTicket(email.id, value)}
                          onOpenChange={(e) => e && e.stopPropagation()}
                        >
                          <SelectTrigger
                            className="h-7 w-[200px] text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue placeholder="Vincular ao ticket" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem ticket</SelectItem>
                            {tickets.map((ticket) => (
                              <SelectItem key={ticket.id} value={ticket.id}>
                                {ticket.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedEmail?.subject}</DialogTitle>
            <DialogDescription>
              De: {selectedEmail?.from_email} | Para: {selectedEmail?.to_email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {selectedEmail?.body}
              </p>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {selectedEmail && formatDate(selectedEmail.created_at)}
              </span>
              {selectedEmail?.ticket && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/tickets/view/?id=${encodeURIComponent(selectedEmail.ticket.id)}`}>
                    <ExternalLink className="mr-2 h-3 w-3" />
                    Ver Ticket
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
