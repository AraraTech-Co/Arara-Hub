
/***
 *
 *   CREDIT CARD
 *   Credit card component used in billing UI
 *
 *   PROPS
 *   last_four: last 4 digits of card number
 *   expires: expiry date
 *   brand: card provider
 *
 **********/

import Style from "./creditcard.tailwind";

type CreditCardProps = {
  last_four: string;
  expires: string;
  brand: string;
};

export function CreditCard(props: CreditCardProps) {
  return (
    <div className={Style.creditCard}>
      <div className={Style.brand}>{props.brand}</div>

      <div className={Style.number}>•••• •••• •••• {props.last_four}</div>

      <div className={Style.col}>
        <div className={Style.title}>EXPIRES</div>
        <div className={Style.value}>{props.expires}</div>
      </div>

      <div className={Style.col}>
        <div className={Style.title}>CVV</div>
        <div className={Style.value}>•••</div>
      </div>
    </div>
  );
}
