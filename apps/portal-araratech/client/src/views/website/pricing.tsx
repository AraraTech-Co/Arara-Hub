// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   PRICING
 *   Modify the PricePlans component with your own features
 *
 **********/

import React from "react";
import { Animate, Row, PricePlans } from "@/components/lib";

export function Pricing(props) {
  return (
    <Animate type="pop">
      <Row color="tint" align="center" title="Simple, affordable pricing">
        <PricePlans />
      </Row>
    </Animate>
  );
}
