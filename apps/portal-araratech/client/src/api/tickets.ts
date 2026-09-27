import Axios from "axios";
import type {
  ApiSuccessResponse,
  TicketDetail,
  TicketExternalAttachment,
  TicketListResponse,
  TicketMessage,
} from "@/types/tickets";

async function get<T>(url: string): Promise<T> {
  const res = await Axios.get<ApiSuccessResponse<T>>(url);
  return res.data.data;
}

export const ticketsApi = {
  list: (params?: {
    status?: string;
    priority?: string;
    severity?: string;
    page?: number;
    page_size?: number;
    created_after?: string;
    created_before?: string;
  }): Promise<TicketListResponse> => {
    const qs = params
      ? "?" + new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => [k, String(v)]),
        ).toString()
      : "";
    return get<TicketListResponse>(`/api/tickets${qs}`);
  },

  getById: (id: string): Promise<TicketDetail> =>
    get<TicketDetail>(`/api/tickets/${id}`),

  getMessages: (id: string, after?: string): Promise<TicketMessage[]> => {
    const qs = after ? `?after=${encodeURIComponent(after)}` : "";
    return get<TicketMessage[]>(`/api/tickets/${id}/messages${qs}`);
  },

  getAttachments: (id: string): Promise<TicketExternalAttachment[]> =>
    get<TicketExternalAttachment[]>(`/api/tickets/${id}/attachments`),
};
