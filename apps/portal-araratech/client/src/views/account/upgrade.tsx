// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   UPGRADE
 *   Upgrade from a free to paid plan
 *
 **********/

import React, { useContext } from "react";
import {
  AuthContext,
  Card,
  PaymentForm,
  useNavigate,
  useLocation,
  Animate,
  usePlans,
  Event,
} from "@/components/lib";

export function Upgrade(props) {
  const navigate = useNavigate();
  const location = useLocation();

  // context/data
  const context = useContext<any>(AuthContext); // TODO: Type This
  const plans = usePlans();
  const list = plans?.data?.list;
  let plan;
  console.log("Upgrade props:", props);
  console.log("AuthContext data:", context);
  console.log("usePlans data:", plans);
  console.log("Plan list:", list);
  console.log("Location data:", location);

  // selected plan
  if (list) {
    const qs = location.search;
    plan = qs.substring(qs.indexOf("?plan=") + 6);

    // remove free & set selected
    const index = list?.findIndex((x) => x.value === "free");
    if (index > -1) list.splice(index, 1);
    plan = plan ? plan : list[0].value;
  }

  return (
    <Animate>
      <Card
        restrictWidth
        title="Upgrade Your Account"
        loading={plans.loading}
        className="upgrade-form"
      >
        <PaymentForm
          inputs={{
            plan: {
              label: "Plan",
              type: "select",
              default: plan,
              options: list,
            },
            token: {
              label: "Credit Card",
              type: "creditcard",
              required: true,
            },
          }}
          url="/api/account/upgrade"
          method="POST"
          buttonText="Upgrade Now"
          callback={(res) => {
            // update the auth context so user can use features on the new plan
            Event("upgraded", { plan: res.data.data.plan });
            context.update({ plan: res.data.data.plan });
            setTimeout(() => navigate("/dashboard"), 2500);
          }}
        />
      </Card>
    </Animate>
  );
}
