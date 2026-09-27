import { PortalSuporteError } from "./types";

export interface PortalSuporteConfig {
  baseUrl: string;
  apiKey: string;
  companyCnpj?: string;
  contactEmail?: string;
}

export function getPortalSuporteConfig(): PortalSuporteConfig {
  const baseUrl = process.env.PORTAL_SUPORTE_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.PORTAL_SUPORTE_API_KEY;
  const companyCnpj = process.env.PORTAL_SUPORTE_COMPANY_CNPJ;
  const contactEmail = process.env.PORTAL_SUPORTE_CONTACT_EMAIL;

  if (!baseUrl || !apiKey) {
    throw new PortalSuporteError(
      "Integração com portal-suporte não configurada (PORTAL_SUPORTE_BASE_URL e PORTAL_SUPORTE_API_KEY)",
      503,
    );
  }

  if (!companyCnpj && !contactEmail) {
    throw new PortalSuporteError(
      "Filtro de cliente não configurado (PORTAL_SUPORTE_COMPANY_CNPJ ou PORTAL_SUPORTE_CONTACT_EMAIL)",
      503,
    );
  }

  return { baseUrl, apiKey, companyCnpj, contactEmail };
}
