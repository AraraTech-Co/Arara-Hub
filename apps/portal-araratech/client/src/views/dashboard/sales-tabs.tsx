import React, { useContext, useCallback, useState, useEffect } from "react";
import Axios from "axios";
import {
  ViewContext,
  Card,
  Table,
  useAPI,
  Message,
  Button,
  TitleRow,
} from "@/components/lib";

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR");
}

function formatPrice(price: number, symbol = "R$") {
  return `${symbol}${Number(price).toFixed(2)}`;
}

const TABLE_HEADER = [
  { name: "owner_name", title: "Nome", sort: true },
  { name: "owner_email", title: "E-mail", sort: true },
  { name: "account_name", title: "Conta", sort: true },
  { name: "plan", title: "Plano", sort: true },
  { name: "plan_active", title: "Status", sort: true },
  { name: "date_created", title: "Cadastro", sort: true },
];

export function SalesCustomers({ className }: { className?: string }) {
  const context = useContext<any>(ViewContext);
  const plans = useAPI("/api/sales/plans");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await Axios.get("/api/sales/accounts");
      const data = res.data?.data ?? [];

      const formatted = data.map((account: any) => ({
        id: account.account_id,
        account_id: account.account_id,
        owner_name: account.owner_name,
        owner_email: account.owner_email,
        account_name: account.account_name,
        plan: account.plan,
        plan_active: account.plan_active ? "Ativo" : "Inativo",
        plan_active_raw: account.plan_active,
        date_created: formatDate(account.date_created),
        actions: { edit: editAccount },
      }));

      (formatted as any).header = TABLE_HEADER;
      setRows(formatted);
    } catch (err) {
      context.handleError(err);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  function planOptions() {
    return (
      plans.data
        ?.filter((p: any) => p.active !== false)
        .map((p: any) => ({
          value: p.id,
          label: p.name,
        })) ?? []
    );
  }

  function editAccount(data: any, callback: Function) {
    context.modal.show(
      {
        title: "Editar cliente",
        text: "Alterar plano ou status da conta do titular.",
        form: {
          plan: {
            label: "Plano",
            type: "select",
            options: planOptions(),
            default: data.plan,
            required: true,
          },
          active: {
            label: "Conta ativa",
            type: "select",
            default: data.plan_active_raw ? 1 : 0,
            options: [
              { value: 1, label: "Ativo" },
              { value: 0, label: "Inativo" },
            ],
            required: true,
          },
        },
        buttonText: "Salvar",
        url: `/api/sales/accounts/${data.account_id}/plan`,
        method: "PATCH",
      },
      () => {
        context.notification.show("Cliente atualizado", "success", true);
        loadAccounts();
        callback();
      },
    );
  }

  return (
    <div className={className}>
      <Message
        title="Clientes"
        type="info"
        text="Titulares de conta e planos atuais. Você pode alterar plano e status da conta."
      />

      <Card title="Clientes">
        <Table
          search
          loading={loading || plans.loading}
          data={rows}
          badge={{
            col: "plan",
            color: "blue",
          }}
          show={[
            "owner_name",
            "owner_email",
            "account_name",
            "plan",
            "plan_active",
            "date_created",
            "actions",
          ]}
        />
      </Card>
    </div>
  );
}

const PLANS_HEADER = [
  { name: "name", title: "Nome", sort: true },
  { name: "price_label", title: "Preço", sort: true },
  { name: "interval", title: "Intervalo", sort: true },
  { name: "status", title: "Status", sort: true },
  { name: "stripe_price_id", title: "Stripe Price", sort: false },
];

export function SalesPlans({ className }: { className?: string }) {
  const context = useContext<any>(ViewContext);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const res = await Axios.get("/api/sales/plans");
      const data = res.data?.data ?? [];

      const formatted = data.map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        price_label: formatPrice(plan.price, plan.currency?.symbol || "R$"),
        interval: plan.interval === "year" ? "Anual" : "Mensal",
        interval_raw: plan.interval,
        status: plan.active === false ? "Inativo" : "Ativo",
        active: plan.active !== false,
        is_free: plan.is_free,
        stripe_price_id: plan.stripe_price_id
          ? `${plan.stripe_price_id.slice(0, 16)}...`
          : "—",
        features: plan.features || [],
        currency: plan.currency?.name || "brl",
        actions: {
          edit: plan.is_free ? undefined : editPlan,
          delete: plan.is_free ? undefined : deactivatePlan,
        },
      }));

      (formatted as any).header = PLANS_HEADER;
      setRows(formatted);
    } catch (err) {
      context.handleError(err);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  function createPlan() {
    context.modal.show(
      {
        title: "Novo plano",
        text: "O plano será criado no Stripe automaticamente. Use um identificador em minúsculas (ex: pro, enterprise).",
        form: {
          id: {
            label: "Identificador",
            type: "text",
            required: true,
            placeholder: "pro",
          },
          name: {
            label: "Nome",
            type: "text",
            required: true,
          },
          price: {
            label: "Preço (R$)",
            type: "number",
            required: true,
          },
          interval: {
            label: "Intervalo",
            type: "select",
            default: "month",
            options: [
              { value: "month", label: "Mensal" },
              { value: "year", label: "Anual" },
            ],
            required: true,
          },
          currency: {
            label: "Moeda",
            type: "select",
            default: "brl",
            options: [
              { value: "brl", label: "BRL" },
              { value: "usd", label: "USD" },
            ],
          },
          features: {
            label: "Recursos (separados por vírgula)",
            type: "text",
            placeholder: "Suporte, Relatórios, API",
          },
        },
        buttonText: "Criar",
        url: "/api/sales/plans",
        method: "POST",
      },
      () => {
        context.notification.show("Plano criado", "success", true);
        loadPlans();
      },
    );
  }

  function editPlan(data: any, callback: Function) {
    context.modal.show(
      {
        title: "Editar plano",
        text: "Alterar preço ou intervalo cria um novo Price no Stripe. Assinaturas atuais mantêm o valor anterior.",
        form: {
          name: {
            label: "Nome",
            type: "text",
            value: data.name,
            required: true,
          },
          price: {
            label: "Preço (R$)",
            type: "number",
            value: data.price,
            required: true,
          },
          interval: {
            label: "Intervalo",
            type: "select",
            default: data.interval_raw,
            options: [
              { value: "month", label: "Mensal" },
              { value: "year", label: "Anual" },
            ],
            required: true,
          },
          currency: {
            label: "Moeda",
            type: "select",
            default: data.currency,
            options: [
              { value: "brl", label: "BRL" },
              { value: "usd", label: "USD" },
            ],
          },
          features: {
            label: "Recursos (separados por vírgula)",
            type: "text",
            value: (data.features || [])
              .map((f: any) => f.name)
              .join(", "),
          },
        },
        buttonText: "Salvar",
        url: `/api/sales/plans/${data.id}`,
        method: "PATCH",
      },
      () => {
        context.notification.show("Plano atualizado", "success", true);
        loadPlans();
        callback();
      },
    );
  }

  function deactivatePlan(data: any, callback: Function) {
    context.modal.show(
      {
        title: "Desativar plano",
        text: `Desativar o plano "${data.name}"? Não será possível se houver contas usando este plano.`,
        form: {},
        buttonText: "Desativar",
        url: `/api/sales/plans/${data.id}/deactivate`,
        method: "PATCH",
        destructive: true,
      },
      () => {
        context.notification.show("Plano desativado", "success", true);
        loadPlans();
        callback();
      },
    );
  }

  return (
    <div className={className}>
      <Message
        title="Catálogo de planos"
        type="info"
        text="Planos são sincronizados com o Stripe. Alterações de preço geram um novo Price no Stripe."
      />

      <TitleRow title="Planos">
        <Button text="Novo plano" action={createPlan} />
      </TitleRow>

      <Card title="Planos" last>
        <Table
          search
          loading={loading}
          data={rows}
          badge={{
            col: "status",
            color: "blue",
            condition: [
              { value: "Ativo", color: "green" },
              { value: "Inativo", color: "red" },
            ],
          }}
          show={[
            "name",
            "price_label",
            "interval",
            "status",
            "stripe_price_id",
            "actions",
          ]}
        />
      </Card>
    </div>
  );
}
