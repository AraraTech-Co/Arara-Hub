import React from "react";
/***
 *
 *   SETUP ONBOARDING FLOW
 *
 **********/

import { Onboarding } from "components/lib";
import { SetupWelcome } from "views/setup/welcome";
import { SetupDatabase } from "views/setup/database";
import { SetupStripe } from "views/setup/stripe";
import { SetupURL } from "views/setup/url";
import { SetupRestart } from "views/setup/restart";
import { SetupAccount } from "views/setup/account";
import { SetupToken } from "views/setup/token";
import { SetupFinished } from "views/setup/finished";

export function SetupOnboarding(props) {
  return (
    <Onboarding
      onFinish="/signin"
      views={[
        {
          name: "Welcome",
          component: <SetupWelcome />,
        },
        {
          name: "Database",
          description: "Connect to your application database",
          component: <SetupDatabase />,
        },
        {
          name: "Stripe",
          description: "Fetch your Stripe plans",
          component: <SetupStripe />,
        },
        {
          name: "URL",
          component: <SetupURL />,
        },
        {
          name: "Token",
          component: <SetupToken />,
        },
        {
          name: "Restart",
          description: "",
          component: <SetupRestart />,
        },
        {
          name: "Account",
          component: <SetupAccount />,
        },
        {
          name: "Finish",
          description: "Boom! That was easy.",
          component: <SetupFinished />,
        },
      ]}
    />
  );
}
