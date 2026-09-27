/***
 *
 *   usePlans hook
 *   fetch, format and return the price plans
 *
 **********/

import { useState, useEffect, useContext } from "react";
import { AuthContext, useAPI } from "components/lib";

export function usePlans() {
  const authContext = useContext(AuthContext);
  const [state, setState] = useState<any>({ data: null, loading: false }); // TODO: Type this //
  const plans = useAPI(`${authContext.remote_server}/api/account/plans`);

  useEffect(() => {
    setState({ loading: true });

    // format plans
    if (plans?.data?.plans) {
      let formatted = [];
      plans.data.plans.map((plan) => {
        let label = `${plan.name} (${plan.currency.symbol}${plan.price}/${plan.interval})`;
        return formatted.push({ value: plan.id, label: label });
      });

      setState({
        data: { list: formatted, active: plans.data.active, raw: plans.data },
        loading: false,
      });
    }
  }, [plans]);

  return state;
}
