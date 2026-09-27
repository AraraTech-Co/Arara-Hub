/***
 *
 *   PRICE PLANS
 *   Pricing table for your landing/pricing page
 *   Update the features array in /config file with your own
 *
 **********/

import {
  Card,
  CheckList,
  Button,
  useNavigate,
  usePlans,
} from "@/components/lib";
import Style from "./pricing.tailwind";


export function PricePlans() {
  const navigate = useNavigate();
  const plans = usePlans();

  if (!plans.data) return null;

  return (
    <section className={Style.plans}>
      {plans?.data?.raw?.plans.map((plan, index) => {
        return (
          <Card shadow rounded key={plan.id} className={Style.plan}>
            <div className={Style.name}>{plan.name}</div>

            <div className={Style.price}>
              {plan?.currency?.symbol}
              {plan.price}
              <small>
                {plan.interval && "/"}
                {plan.interval}
              </small>
            </div>

            <CheckList items={plan.features} className={Style.features} />
            <Button
              text="Sign Up"
              fullWidth
              className={Style.button}
              action={(e) => navigate("/signup")}
            />
          </Card>
        );
      })}
    </section>
  );
}
