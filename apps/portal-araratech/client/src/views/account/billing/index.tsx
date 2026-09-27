/***
 *
 *   BILLING
 *   Change subscription, update card details or view past invoices
 *
 **********/

import React, { Fragment, useContext } from "react";
import {
  AuthContext,
  AccountNav,
  TabView,
  Message,
  Animate,
  useAPI,
} from "@/components/lib";

import { BillingPlan } from "./plan";
import { BillingCard } from "./card";
import { BillingInvoices } from "./invoices";

import Messages from "./messages.json";

export function Billing(props) {
  // state/context
  const context = useContext<any>(AuthContext); // TODO: Type this

  // fetch subscription
  const subscription = useAPI("/api/account/subscription");
  const isPaid = context.user.plan === "free" ? false : true;
  const labels = ["Plan"];
  if (isPaid) labels.push("Card", "Invoices");
  console.log("Billing props:", props);
  console.log("AuthContext data:", context);
  console.log("Subscription data:", subscription);
  console.log("Is paid plan:", isPaid);
  console.log("Tab labels:", labels);
  return (
    <Fragment>
      <AccountNav />
      <Animate>
        {!subscription?.loading &&
          subscription?.data?.status !== "active" &&
          subscription?.data?.status !== "trialing" && (
            <Message {...Messages[subscription.data?.status]} />
          )}

        <TabView name="Billing" labels={labels}>
          <BillingPlan subscription={subscription} />

          {isPaid && <BillingCard />}

          {isPaid && <BillingInvoices />}
        </TabView>
      </Animate>
    </Fragment>
  );
}
