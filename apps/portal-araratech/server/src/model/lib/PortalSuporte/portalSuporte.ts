import axios, { AxiosError, AxiosInstance } from "axios";
import { getPortalSuporteConfig } from "./config";
import type {
  ExternalApiSingleResponse,
  ExternalAttachment,
  ExternalMessage,
  ExternalTicketDetail,
  ExternalTicketListFilters,
  PaginatedTickets,
} from "./types";
import { PortalSuporteError } from "./types";

function resolveFileUrl(baseUrl: string, fileUrl: string): string {
  if (fileUrl.startsWith("http")) return fileUrl;
  return `${baseUrl}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

function resolveDetailAttachmentUrls(
  ticket: ExternalTicketDetail,
  baseUrl: string,
): ExternalTicketDetail {
  return {
    ...ticket,
    attachments: ticket.attachments.map((a) => ({
      ...a,
      file_url: resolveFileUrl(baseUrl, a.file_url),
    })),
  };
}

function resolveAttachmentList(
  attachments: ExternalAttachment[],
  baseUrl: string,
): ExternalAttachment[] {
  return attachments.map((a) => ({
    ...a,
    fileUrl: resolveFileUrl(baseUrl, a.fileUrl),
  }));
}

function handleAxiosError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{ error?: string }>;
    const status = axiosErr.response?.status ?? 502;
    const message =
      axiosErr.response?.data?.error ??
      axiosErr.message ??
      "Erro ao comunicar com portal-suporte";
    throw new PortalSuporteError(message, status);
  }
  throw err;
}

export default class PortalSuporteService {
  private getClient(): AxiosInstance {
    const { baseUrl, apiKey } = getPortalSuporteConfig();
    return axios.create({
      baseURL: `${baseUrl}/api/external`,
      headers: { "x-api-key": apiKey },
      timeout: 15000,
    });
  }

  private buildListParams(
    filters: ExternalTicketListFilters = {},
  ): Record<string, string | number> {
    const { companyCnpj, contactEmail } = getPortalSuporteConfig();

    return {
      ...(companyCnpj ? { company_cnpj: companyCnpj } : {}),
      ...(contactEmail ? { contact_email: contactEmail } : {}),
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""),
      ),
    };
  }

  async list(filters: ExternalTicketListFilters = {}): Promise<PaginatedTickets> {
    const client = this.getClient();

    try {
      const res = await client.get<PaginatedTickets>("/tickets", {
        params: this.buildListParams(filters),
      });
      return res.data;
    } catch (err) {
      handleAxiosError(err);
    }
  }

  async getById(id: string): Promise<ExternalTicketDetail> {
    const { baseUrl } = getPortalSuporteConfig();
    const client = this.getClient();

    try {
      const res = await client.get<ExternalApiSingleResponse<ExternalTicketDetail>>(
        `/tickets/${id}`,
      );
      return resolveDetailAttachmentUrls(res.data.data, baseUrl);
    } catch (err) {
      handleAxiosError(err);
    }
  }

  async getMessages(id: string, after?: string): Promise<ExternalMessage[]> {
    const client = this.getClient();

    try {
      const res = await client.get<ExternalApiSingleResponse<ExternalMessage[]>>(
        `/tickets/${id}/messages`,
        { params: after ? { after } : undefined },
      );
      return res.data.data;
    } catch (err) {
      handleAxiosError(err);
    }
  }

  async getAttachments(id: string): Promise<ExternalAttachment[]> {
    const { baseUrl } = getPortalSuporteConfig();
    const client = this.getClient();

    try {
      const res = await client.get<ExternalApiSingleResponse<ExternalAttachment[]>>(
        `/tickets/${id}/attachments`,
      );
      return resolveAttachmentList(res.data.data, baseUrl);
    } catch (err) {
      handleAxiosError(err);
    }
  }
}
