/***
 *
 *   BILLING / PLAN
 *   Update the billing plan
 *
 **********/

import React, { useContext } from "react";
import { AuthContext, Card, Form, Message, usePlans } from "@/components/lib";

export function BillingPlan(props) {
  const plans = usePlans();
  const context = useContext<any>(AuthContext); //TODO: Type this
  console.log("BillingPlan props:", props);
console.log("usePlans data:", plans);
console.log("AuthContext data:", context);
console.log("props.subscription:", props.subscription);
console.log("Plans list:", plans?.data?.list);
  return (
    <Card
      loading={plans.loading || props.subscription.loading}
      restrictWidth
      className={props.className}
    >
      {props.subscription?.data?.object && (
        <Message
          type="info"
          title="Your Billing Cycle"
          text={`${props.subscription.data.object.current_period_start} to ${props.subscription.data.object.current_period_end}`}
        />
      )}

      <Form
        inputs={{
          plan: {
            label: "Your subscription plan",
            type: "select",
            required: true,
            default: plans?.data?.active,
            options: plans?.data?.list,
          },
        }}
        url="/api/account/plan"
        method="PATCH"
        buttonText="Update Plan"
        callback={(res) => {
          context.update({ plan: res.data.data.plan });
        }}
      />
    </Card>
  );
}
