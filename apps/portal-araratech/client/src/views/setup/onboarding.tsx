// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SETUP ONBOARDING FLOW
 *
 **********/

import React from "react";
import { Onboarding } from "@/components/lib";
import { SetupWelcome } from "@/views/setup/welcome";
import { SetupDatabase } from "@/views/setup/database";
import { SetupStripe } from "@/views/setup/stripe";
import { SetupMailgun } from "@/views/setup/mailgun";
import { SetupDomain } from "@/views/setup/domain";
import { SetupAuth } from "@/views/setup/auth";
import { SetupFinished } from "@/views/setup/finished";

export function SetupOnboarding(props) {
  return (
    <Onboarding
      onFinish="/signup"
      views={[
        {
          name: "Welcome",
          component: <SetupWelcome />,
        },
        {
          name: "Database",
          description: `You'll need an empty MySQL database set up for this step.`,
          component: <SetupDatabase />,
        },
        {
          name: "Stripe",
          description: `You'll need to create a Stripe product and price plans for this.`,
          component: <SetupStripe />,
        },
        {
          name: "Mailgun",
          description: `You'll need a Mailgun account and verified domain.`,
          component: <SetupMailgun />,
        },
        {
          name: "Domain",
          component: <SetupDomain />,
        },
        {
          name: "Authentication",
          description: `Complete this set if you'd like to enable social sign ons.`,
          component: <SetupAuth />,
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
