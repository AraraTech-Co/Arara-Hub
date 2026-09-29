'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Building2, Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { companiesApi } from '@/lib/api/companies';
import { useCompanies, chaveEmpresa } from '@/hooks/use-companies';
import { mascaraTelefone } from '@/lib/utils';

// ─── Types (shared with create-ticket-wizard) ─────────────────────────────────

export interface CompanyOption {
  id: string;
  name: string;
  tradeName: string | null;
  cnpj: string | null;
  city: string | null;
}

export interface CompanyContext {
  id: string;
  name: string;
  tradeName: string | null;
  product: string | null;
  hasPdv: boolean;
  serverName: string | null;
  serverType: string | null;
  operationType: string | null;
  slaContract: { id: string; name: string; tier: string } | null;
  units: Array<{ id: string; name: string; city: string | null; state: string | null; cnpj?: string | null }>;
  contacts: Array<{ id: string; name: string; contactType: string; phone: string | null; whatsapp: string | null; email: string | null }>;
  activeTicketsCount: number;
}

export interface CompanySelectionUpdate {
  company_id: string | null;
  company_name: string;
  company_cnpj: string;
  unit_id: string | null;
  contact_id: string | null;
  contact_phone?: string;
  contact_email?: string;
}

interface CompanySelectorProps {
  companyId: string | null;
  companyName: string;
  unitId: string | null;
  contactId: string | null;
  onChange: (update: Partial<CompanySelectionUpdate>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CompanySelector({
  companyId,
  companyName,
  unitId,
  contactId,
  onChange,
}: CompanySelectorProps) {
  // Só o cadastro real. Oferecer as 122 que vieram do texto livre de chamados
  // antigos é oferecer o erro pronto — ver lib/empresas.ts.
  const { cadastradas: todasEmpresas } = useCompanies()

  const [searchQuery, setSearchQuery]       = useState(companyName);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [companyContext, setCompanyContext] = useState<CompanyContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const companyRef  = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Outside-click closes dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync display with external reset (e.g. wizard close)
  useEffect(() => {
    if (!companyId) {
      setSearchQuery('');
      setCompanyContext(null);
      setCompanyOptions([]);
      setShowSuggestions(false);
    }
  }, [companyId]);

  // Filtra sobre a lista completa, já em memória. Era `?search=` no servidor
  // com limite 10: a busca de lá não normaliza — "2a20" achava 12 empresas e
  // "2 a 20" achava 1 —, e o teto de 10 escondia o resto. Quem não achava
  // digitava o nome à mão, e é daí que vem a duplicação no cadastro.
  const searchCompanies = useCallback((q: string) => {
    const chave = chaveEmpresa(q);
    if (chave.length < 2) { setCompanyOptions([]); setShowSuggestions(false); return; }
    const achadas = todasEmpresas.filter(c =>
      [c.name, c.tradeName ?? '', c.cnpj ?? ''].some(t => chaveEmpresa(String(t)).includes(chave))
    );
    setCompanyOptions(achadas.slice(0, 80).map(c => ({
      id: c.id, name: c.name, tradeName: c.tradeName ?? null, cnpj: c.cnpj ?? null, city: c.city ?? null,
    })));
    setShowSuggestions(true);
  }, [todasEmpresas]);

  const loadCompanyContext = useCallback(async (id: string) => {
    setLoadingContext(true);
    try {
      const resp = await companiesApi.getContext(id);
      if (resp.success && resp.data) setCompanyContext(resp.data);
    } catch { /* silent */ }
    finally { setLoadingContext(false); }
  }, []);

  // O que se digita aqui BUSCA; não vira empresa. Antes, o texto solto ia
  // direto para `company_name` do chamado, e é assim que "Shopping Util
  // Americana" passou a existir ao lado de "Shopping da Utilidade - Americana".
  // Agora o vínculo só se forma escolhendo alguém da lista.
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (companyId) {
      onChange({ company_id: null, company_name: '', unit_id: null, contact_id: null });
      setCompanyContext(null);
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchCompanies(q), 300);
  };

  // O CNPJ da matriz fica guardado: ao desmarcar a filial, ele volta. Sem isso
  // o campo ficaria com o CNPJ da filial anterior, que é pior do que vazio.
  const [cnpjDaMatriz, setCnpjDaMatriz] = useState('');

  const selectCompany = (c: CompanyOption) => {
    setCnpjDaMatriz(c.cnpj ?? '');
    setSearchQuery(c.name);
    setShowSuggestions(false);
    setCompanyOptions([]);
    onChange({
      company_id:   c.id,
      company_name: c.name,
      company_cnpj: c.cnpj ?? '',
      unit_id:      null,
      contact_id:   null,
    });
    loadCompanyContext(c.id);
  };

  return (
    <div className="space-y-4">
      {/* Search input + dropdown */}
      <div className="relative space-y-1.5" ref={companyRef}>
        <Label className="text-muted-foreground/50 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
          Empresa <span className="text-red-400">*</span>
        </Label>
        <Input
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => { if (searchQuery.length >= 2) setShowSuggestions(true); }}
          placeholder="Busque e escolha uma empresa cadastrada..."
          className="border-border bg-background text-foreground placeholder:text-muted-foreground"
          autoFocus
          autoComplete="off"
        />
        {showSuggestions && companyOptions.length > 0 && (
          <ul className="absolute z-50 w-full rounded-md border border-border bg-background shadow-lg max-h-52 overflow-y-auto">
            {companyOptions.map(c => (
              <li
                key={c.id}
                onMouseDown={() => selectCompany(c)}
                className="flex items-start gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted cursor-pointer"
              >
                <Building2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/70 shrink-0" />
                <div>
                  <span className="font-medium">{c.name}</span>
                  {c.tradeName && c.tradeName !== c.name && (
                    <span className="ml-1.5 text-muted-foreground/70 text-xs">({c.tradeName})</span>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    {[c.cnpj, c.city].filter(Boolean).join(' • ')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {companyId ? (
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <Check className="h-3 w-3" />
            <span>Empresa vinculada: <span className="font-medium">{searchQuery}</span></span>
          </div>
        ) : (
          // Sem isto, quem digitasse e não escolhesse acharia que vinculou.
          <p className="text-xs text-muted-foreground/70">
            {searchQuery.trim().length >= 2 && companyOptions.length === 0
              ? 'Nenhuma empresa cadastrada com esse nome. Cadastre em Empresas antes de abrir o chamado.'
              : 'Escolha uma empresa da lista — o chamado não aceita nome digitado.'}
          </p>
        )}
      </div>

      {/* Context panel */}
      {loadingContext && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando informações da empresa...
        </div>
      )}
      {companyContext && !loadingContext && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-semibold text-foreground">{companyContext.tradeName || companyContext.name}</p>
          {companyContext.product && (
            <p className="text-muted-foreground/70">Produto: <span className="text-foreground">{companyContext.product}</span></p>
          )}
          {companyContext.slaContract && (
            <p className="text-muted-foreground/70">SLA: <span className="text-foreground">{companyContext.slaContract.name} ({companyContext.slaContract.tier})</span></p>
          )}
          {companyContext.serverName && (
            <p className="text-muted-foreground/70">
              Servidor: <span className="text-foreground">
                {companyContext.serverName}{companyContext.serverType ? ` (${companyContext.serverType})` : ''}
              </span>
            </p>
          )}
          <p className="text-muted-foreground/70">
            Tickets abertos:{' '}
            <span className={companyContext.activeTicketsCount > 5 ? 'text-amber-400 font-semibold' : 'text-foreground'}>
              {companyContext.activeTicketsCount}
            </span>
          </p>
        </div>
      )}

      {/* Unit selector */}
      {companyContext && companyContext.units.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground/50">Unidade / Filial</Label>
          {/* A filial costuma ter CNPJ próprio, e é o dela que vale no chamado.
              Voltar para "Matriz" restaura o CNPJ da empresa; unidade sem CNPJ
              cadastrado também cai na matriz, em vez de esvaziar o campo. */}
          <Select
            value={unitId ?? '__none__'}
            onValueChange={v => {
              const escolhida = v === '__none__' ? null : (companyContext?.units.find(u => u.id === v) ?? null)
              onChange({
                unit_id: escolhida ? escolhida.id : null,
                company_cnpj: (escolhida?.cnpj ?? '') || cnpjDaMatriz,
              })
            }}
          >
            <SelectTrigger className="border-border bg-background text-foreground">
              <SelectValue placeholder="— Matriz / Não especificada" />
            </SelectTrigger>
            <SelectContent className="border-border bg-background text-foreground">
              <SelectItem value="__none__">— Matriz / Não especificada</SelectItem>
              {companyContext.units.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}{u.city ? ` — ${u.city}${u.state ? `/${u.state}` : ''}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Contact selector */}
      {companyContext && companyContext.contacts.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground/50">Contato solicitante</Label>
          <Select
            value={contactId ?? '__none__'}
            onValueChange={v => {
              if (v === '__none__') {
                onChange({ contact_id: null });
                return;
              }
              const contato = companyContext.contacts.find(c => c.id === v);
              const rawTel = contato?.whatsapp || contato?.phone || '';
              onChange({
                contact_id: v,
                ...(rawTel ? { contact_phone: mascaraTelefone(rawTel) } : {}),
                ...(contato?.email ? { contact_email: contato.email } : {}),
              });
            }}
          >
            <SelectTrigger className="border-border bg-background text-foreground">
              <SelectValue placeholder="— Selecione o contato" />
            </SelectTrigger>
            <SelectContent className="border-border bg-background text-foreground">
              <SelectItem value="__none__">— Não especificado</SelectItem>
              {companyContext.contacts.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.contactType})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
