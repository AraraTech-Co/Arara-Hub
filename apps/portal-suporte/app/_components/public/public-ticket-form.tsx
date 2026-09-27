"use client"

import type React from "react"
import type { TicketPriority } from "@/db/types"
import { PRIORITY_OPTIONS } from "@/lib/ticket-priority"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface PublicTicketFormProps {
  onSuccess?: (ticketId: string) => void
}

type FormFields = {
  companyName: string
  cnpj: string
  contactEmail: string
  contactPhone: string
  title: string
  description: string
  category: string
  priority: TicketPriority
  preferredChannel: "email" | "whatsapp" | "telefone" | "portal"
}

type FieldErrors = Partial<Record<keyof FormFields, string>>

export function PublicTicketForm({ onSuccess }: PublicTicketFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormFields>({
    companyName: "",
    cnpj: "",
    contactEmail: "",
    contactPhone: "",
    title: "",
    description: "",
    category: "",
    priority: "medium",
    preferredChannel: "email",
  })

  const validate = (data: FormFields): FieldErrors => {
    const next: FieldErrors = {}
    if (!data.companyName.trim()) next.companyName = "Informe o nome da empresa."
    const cnpjDigits = data.cnpj.replace(/\D/g, "")
    if (!cnpjDigits) next.cnpj = "Informe o CNPJ."
    else if (cnpjDigits.length !== 14) next.cnpj = "CNPJ deve ter 14 dígitos."
    if (!data.contactEmail.trim()) next.contactEmail = "Informe um e-mail de contato."
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) next.contactEmail = "E-mail inválido."
    // O WhatsApp passou a ser OBRIGATÓRIO: é por ele que sai o código de
    // acompanhamento do chamado. Sem número, a pessoa abre o chamado e fica
    // sem como acompanhá-lo — que era exatamente o que acontecia antes.
    const foneDigitos = data.contactPhone.replace(/\D/g, "")
    if (!foneDigitos) next.contactPhone = "Informe o WhatsApp — é por ele que você recebe o código de acompanhamento."
    else if (foneDigitos.length < 10) next.contactPhone = "Número incompleto. Use DDD + número."
    if (!data.title.trim()) next.title = "Informe um título."
    if (!data.description.trim()) next.description = "Descreva o problema."
    if (!data.category) next.category = "Selecione a categoria."
    return next
  }

  const channelMap: Record<string, string> = {
    email: 'email',
    whatsapp: 'whatsapp',
    telefone: 'phone',
    portal: 'chat',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    const fieldErrors = validate(formData)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      return
    }

    setLoading(true)
    try {
      const { arara } = await import('@/lib/arara/client')
      const json = await arara.createTicket({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        communication_preference: channelMap[formData.preferredChannel] || 'email',
        is_public: true,
        company_name: formData.companyName,
        company_cnpj: formData.cnpj,
        contact_email: formData.contactEmail,
        // Ia coletado e era DESCARTADO aqui: o campo existia na tela e nunca
        // chegava ao servidor. É deste número que sai o código de
        // acompanhamento, e é ele que o atendimento usa para retornar.
        contact_phone: formData.contactPhone,
      })

      const ticketId = String(json.id || '')
      if (onSuccess) {
        onSuccess(ticketId)
      } else {
        router.push(`/ticket-criado${ticketId ? `?id=${ticketId}` : ''}`)
      }
    } catch (error) {
      console.error("Error creating ticket:", error)
      const message = error instanceof Error ? error.message : "Ocorreu um erro ao criar seu ticket. Por favor, tente novamente."
      setSubmitError(message)
      toast({
        title: "Erro ao criar ticket",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, "")
    if (numbers.length <= 14) {
      return numbers
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2")
    }
    return value
  }

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "")
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2")
    }
    return value
  }

  const fieldError = (field: keyof FormFields) =>
    errors[field] ? (
      <p className="flex items-center gap-1 text-sm text-sem-error-fg" role="alert">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {errors[field]}
      </p>
    ) : null

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {submitError && (
        <div className="flex items-center gap-2 rounded-md border border-sem-error-bd bg-sem-error px-3 py-2 text-sm text-sem-error-fg" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="companyName">
            Nome da Empresa *
          </Label>
          <Input
            id="companyName"
            required
            aria-invalid={!!errors.companyName}
            aria-describedby={errors.companyName ? "companyName-error" : undefined}
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            className={cn(errors.companyName && "border-sem-error-bd focus-visible:ring-sem-error-bd")}
            placeholder="Ex: Empresa LTDA"
          />
          <div id="companyName-error">{fieldError("companyName")}</div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cnpj">
            CNPJ *
          </Label>
          <Input
            id="cnpj"
            required
            aria-invalid={!!errors.cnpj}
            aria-describedby={errors.cnpj ? "cnpj-error" : undefined}
            value={formData.cnpj}
            onChange={(e) => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
            className={cn(errors.cnpj && "border-sem-error-bd focus-visible:ring-sem-error-bd")}
            placeholder="00.000.000/0000-00"
            maxLength={18}
          />
          <div id="cnpj-error">{fieldError("cnpj")}</div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contactEmail">
            E-mail de Contato *
          </Label>
          <Input
            id="contactEmail"
            type="email"
            required
            aria-invalid={!!errors.contactEmail}
            aria-describedby={errors.contactEmail ? "contactEmail-error" : undefined}
            value={formData.contactEmail}
            onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
            className={cn(errors.contactEmail && "border-sem-error-bd focus-visible:ring-sem-error-bd")}
            placeholder="contato@empresa.com.br"
          />
          <div id="contactEmail-error">{fieldError("contactEmail")}</div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactPhone">
            WhatsApp <span aria-hidden className="text-sem-error-fg">*</span>
          </Label>
          <Input
            id="contactPhone"
            type="tel"
            required
            aria-invalid={!!errors.contactPhone}
            aria-describedby="contactPhone-ajuda"
            value={formData.contactPhone}
            onChange={(e) => setFormData({ ...formData, contactPhone: formatPhone(e.target.value) })}
            placeholder="(00) 00000-0000"
            maxLength={15}
          />
          <p id="contactPhone-ajuda" className="text-xs text-muted-foreground">
            Enviamos por aqui o número do chamado e o código para acompanhá-lo.
          </p>
          {errors.contactPhone && (
            <p role="alert" className="text-xs text-sem-error-fg">{errors.contactPhone}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">
          Título do Problema *
        </Label>
        <Input
          id="title"
          required
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "title-error" : undefined}
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className={cn(errors.title && "border-sem-error-bd focus-visible:ring-sem-error-bd")}
          placeholder="Descreva brevemente o problema"
        />
        <div id="title-error">{fieldError("title")}</div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          Descrição do Problema *
        </Label>
        <Textarea
          id="description"
          required
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "description-error" : undefined}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className={cn("min-h-32", errors.description && "border-sem-error-bd focus-visible:ring-sem-error-bd")}
          placeholder="Descreva detalhadamente o problema que está enfrentando no sistema..."
        />
        <div id="description-error">{fieldError("description")}</div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">
            Categoria do Sistema *
          </Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData({ ...formData, category: value })}
            required
          >
            <SelectTrigger id="category" aria-invalid={!!errors.category} className={cn(errors.category && "border-sem-error-bd focus-visible:ring-sem-error-bd")}>
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sistema_financeiro">Sistema Financeiro</SelectItem>
              <SelectItem value="sistema_vendas">Sistema de Vendas</SelectItem>
              <SelectItem value="sistema_estoque">Sistema de Estoque</SelectItem>
              <SelectItem value="sistema_rh">Sistema de RH</SelectItem>
              <SelectItem value="erp">ERP</SelectItem>
              <SelectItem value="crm">CRM</SelectItem>
              <SelectItem value="site">Site/Portal</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
          {fieldError("category")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">
            Prioridade *
          </Label>
          <Select
            value={formData.priority}
            onValueChange={(value) => setFormData({ ...formData, priority: value as TicketPriority })}
            required
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="preferredChannel">
          Canal de Comunicação Preferido *
        </Label>
        <Select
          value={formData.preferredChannel}
          onValueChange={(value) => setFormData({ ...formData, preferredChannel: value as any })}
          required
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="email">E-mail</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="telefone">Telefone</SelectItem>
            <SelectItem value="portal">Portal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Criando ticket...
          </>
        ) : (
          "Criar Ticket de Suporte"
        )}
      </Button>
    </form>
  )
}
