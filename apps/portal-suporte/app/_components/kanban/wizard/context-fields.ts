// ─── Category → contextual fields map ────────────────────────────────────────

export type ContextFieldDef =
  | { type: 'select'; key: string; label: string; options: string[]; required?: boolean }
  | { type: 'text'; key: string; label: string; placeholder: string; required?: boolean }
  | { type: 'textarea'; key: string; label: string; placeholder: string; required?: boolean };

const CATEGORY_CONTEXT_FIELDS: Record<string, ContextFieldDef[]> = {
  tef: [
    { type: 'select', key: 'adquirente', label: 'Adquirente', options: ['Stone', 'Cielo', 'Rede', 'GetNet', 'PagSeguro', 'Safra', 'Outro'], required: true },
    { type: 'text', key: 'terminal', label: 'Número do terminal', placeholder: 'Ex: 00123456' },
    { type: 'text', key: 'loja_pdv', label: 'Loja / PDV', placeholder: 'Ex: Loja Centro — PDV-001' },
    { type: 'select', key: 'status_integracao', label: 'Status da integração', options: ['Ativo', 'Inativo', 'Não verificado'] },
  ],
  fiscal: [
    { type: 'select', key: 'modelo_fiscal', label: 'Modelo fiscal', options: ['NFC-e', 'SAT/MFe', 'NF-e', 'NFSe', 'Outro'], required: true },
    { type: 'text', key: 'codigo_rejeicao', label: 'Código de rejeição', placeholder: 'Ex: 228 — opcional' },
    { type: 'select', key: 'ambiente', label: 'Ambiente', options: ['Produção', 'Homologação'], required: true },
    { type: 'text', key: 'certificado_digital', label: 'Certificado digital', placeholder: 'Validade: DD/MM/AAAA — opcional' },
  ],
  pdv: [
    { type: 'text', key: 'numero_pdv', label: 'Número do PDV / Terminal', placeholder: 'Ex: PDV-001', required: true },
    { type: 'text', key: 'versao_sistema', label: 'Versão do sistema', placeholder: 'Ex: 4.12.0 — opcional' },
    { type: 'select', key: 'tipo_erro', label: 'Tipo de erro', options: ['Travamento', 'Lentidão', 'Erro de impressão', 'Erro de NFC-e', 'Módulo financeiro', 'Outro'], required: true },
  ],
  erp: [
    { type: 'select', key: 'modulo_afetado', label: 'Módulo afetado', options: ['Compras', 'Vendas', 'Fiscal', 'Financeiro', 'Estoque', 'Relatórios', 'Outro'], required: true },
    { type: 'text', key: 'versao_erp', label: 'Versão do ERP', placeholder: 'Ex: 2.45.1 — opcional' },
    { type: 'select', key: 'ambiente', label: 'Ambiente', options: ['Produção', 'Homologação'], required: true },
  ],
  infraestrutura: [
    { type: 'select', key: 'tipo_infra', label: 'Tipo de infraestrutura', options: ['Servidor', 'Rede', 'Banco de dados', 'Integração API', 'Certificado SSL', 'Outro'], required: true },
    { type: 'text', key: 'ip_host', label: 'IP / Host', placeholder: 'Ex: 192.168.0.10 ou servidor.empresa.com — opcional' },
  ],
};

const GENERIC_CONTEXT_FIELDS: ContextFieldDef[] = [
  { type: 'textarea', key: 'contexto_adicional', label: 'Contexto adicional', placeholder: 'Forneça detalhes específicos sobre o contexto do problema…' },
];

/**
 * Returns contextual fields for a given category value.
 * Category matching is case-insensitive and also matches common variants.
 */
export function getContextFields(category: string): ContextFieldDef[] {
  const key = category.toLowerCase().trim();
  if (key.includes('tef') || key.includes('adquirente') || key.includes('maquininha')) return CATEGORY_CONTEXT_FIELDS.tef;
  if (key.includes('fiscal') || key.includes('nf-e') || key.includes('nfe') || key.includes('sat') || key.includes('nfce')) return CATEGORY_CONTEXT_FIELDS.fiscal;
  if (key.includes('pdv') || key.includes('ponto de venda') || key.includes('frente de caixa')) return CATEGORY_CONTEXT_FIELDS.pdv;
  if (key.includes('erp') || key.includes('sistema') || key.includes('sgc')) return CATEGORY_CONTEXT_FIELDS.erp;
  if (key.includes('infra') || key.includes('servidor') || key.includes('rede') || key.includes('banco')) return CATEGORY_CONTEXT_FIELDS.infraestrutura;
  if (!key) return [];
  // For all other known categories with some content, show generic textarea
  return GENERIC_CONTEXT_FIELDS;
}

/**
 * Format context_data as a structured block to append to description.
 */
export function formatContextBlock(contextData: Record<string, string>, category: string): string {
  const entries = Object.entries(contextData).filter(([, v]) => v.trim());
  if (!entries.length) return '';

  const fields = getContextFields(category);
  const lines = entries.map(([key, val]) => {
    const fieldDef = fields.find(f => f.key === key);
    const label = fieldDef?.label ?? key;
    return `- ${label}: ${val}`;
  });

  return `\n\n[Contexto Operacional]\n${lines.join('\n')}`;
}
