/***
 *
 *   usePlans hook
 *   fetch, format and return the price plans
 *
 **********/

import { useState, useEffect } from "react";
import { useAPI } from "@/components/lib";

export function usePlans() {
  const [state, setState] = useState<any>({ data: null, loading: false }); // TODO: Type this
  const plans = useAPI("/api/account/plans");
  console.log("usePlans hook state:", state);
  console.log("API response plans:", plans?.data?.plans);
  console.log("Active plan:", plans?.data?.active);
  console.log("Raw plans data:", plans?.data);
  useEffect(() => {
    setState({ loading: true });
    
    // format plans
    if (plans?.data?.plans) {
      let formatted = [];
      plans.data.plans.map((plan) => {
        let label = `${plan.name} (${plan.currency.symbol}${plan.price}/${plan.interval})`;
        return formatted.push({ value: plan.id, label: label });
      });
      console.log("Formatted plans:", formatted);
      setState({
        data: { list: formatted, active: plans.data.active, raw: plans.data },
        loading: false,
      });
    }
  }, [plans]);

  return state;
}
