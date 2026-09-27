/***
 *
 *   BILLING
 *   Update card details
 *
 **********/

import React, { useState, useEffect } from "react";
import { Card, CreditCard, PaymentForm, useAPI } from "@/components/lib";

export function BillingCard(props) {
  const [card, setCard] = useState(null);
  const data = useAPI("/api/account/card");

  useEffect(() => {
    if (data.data) setCard(data.data);
  }, [data.data]);

  return (
    <Card restrictWidth loading={data.loading} className={props.className}>
      {card && (
        <CreditCard
          brand={card.brand}
          last_four={card.last4}
          expires={`${card.exp_month}/${card.exp_year}`}
        />
      )}

      <PaymentForm
        className="restrict-width"
        inputs={{
          token: {
            label: "Update Your Card",
            type: "creditcard",
            required: true,
          },
        }}
        url="/api/account/card"
        method="PATCH"
        callback={(res) => setCard(res.data.data)}
        buttonText="Save Card"
      />
    </Card>
  );
}
