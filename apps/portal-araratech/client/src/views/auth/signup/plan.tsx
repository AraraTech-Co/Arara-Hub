// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SIGN UP STEP 2
 *   Signup form for account owners
 *   Step 1: create account
 *   Step 2: select plan and make payment
 *
 **********/

import React, { useContext } from "react";
import {
  Animate,
  AuthContext,
  Row,
  Card,
  PaymentForm,
  usePlans,
  Link,
  useNavigate,
  Event,
} from "@/components/lib";

export function SignupPlan(props: any): React.ReactElement | null {
  console.log(props)
  const context = useContext<any>(AuthContext); // TODO: Type this
  const navigate = useNavigate();
  const plans = usePlans();
  const plan = window.location.hash.substring(1);

  if (!plans.data) return null;
  console.log("SignupPlan props:", props);
  console.log("AuthContext data:", context);
  console.log("usePlans data:", plans);
  console.log("Selected plan from hash:", plan);
  return (
    <Animate type="pop">
      <Row title="Select Your Plan">
        <Card loading={false} restrictWidth center>
          <PaymentForm
            inputs={{
              plan: {
                label: "Plan",
                type: "select",
                options: plans.data.list,
                default: plan,
                required: true,
              },
              token: {
                label: "Credit Card",
                type: "creditcard",
                required: true,
              },
            }}
            url="/api/account/plan"
            method="POST"
            buttonText="Save Plan"
            callback={(res) => {
              // save the plan to context, then redirect
              Event("selected_plan", { plan: res.data.plan });
              context.update({
                plan: res.data.plan,
                subscription: res.data.subscription,
              });
              navigate(res.data.onboarded ? "/dashboard" : "/welcome");
            }}
          />

          <div className="mt-4">
            <Link url="/account/profile" text="Manage Your Account" />
          </div>
        </Card>
      </Row>
    </Animate>
  );
}
