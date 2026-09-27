import React from "react";
import { Card, Table, useAPI } from "@/components/lib";

export function BillingInvoices(props) {
  const invoices = useAPI("/api/account/invoice");

  return (
    <Card className={props.className}>
      <Table
        loading={invoices.loading}
        badge={{
          col: "status",
          color: "red",
          condition: [{ value: "paid", color: "green" }],
        }}
        data={invoices?.data?.map((x) => {
          return {
            invoice_number: x.number,
            date: x.date,
            status: x.status,
            total: x.total,
            actions: { download: x.invoice_pdf },
          };
        })}
      />
    </Card>
  );
}
