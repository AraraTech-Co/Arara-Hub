import React, { Fragment } from "react";
import { TabView, Animate } from "@/components/lib";
import { SalesCustomers, SalesPlans } from "./sales-tabs";

export function Sales() {
  return (
    <Animate>
      <TabView name="Sales" labels={["Clientes", "Planos"]}>
        <SalesCustomers />
        <SalesPlans />
      </TabView>
    </Animate>
  );
}
