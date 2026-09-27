import { api } from './client'

export interface AiFeedback {
  conversationId: string
  messageId?: string
  rating: 'positive' | 'negative'
  comment?: string
}

export interface AutoCreateTicketInput {
  conversationId: string
  summary?: string
}

export interface AutoCreateTicketResult {
  ticketId: string
  ticketNumber: string
}

export const aiApi = {
  submitFeedback: (data: AiFeedback) =>
    api.post<void>('/api/ai/feedback', data),

  autoCreateTicket: (data: AutoCreateTicketInput) =>
    api.post<AutoCreateTicketResult>('/api/ai/auto-create-ticket', data),
}
