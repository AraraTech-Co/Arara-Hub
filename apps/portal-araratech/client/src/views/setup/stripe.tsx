// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SETUP DATABASE
 *   Configures your Stripe settings for processing payments.
 *   You can delete this when you've completed the setup process.
 *
 **********/

import React, { Fragment } from "react";
import { Form, Loader, Helper, useAPI } from "@/components/lib";

export function SetupStripe(props) {
  const settings = useAPI("/api/setup/stripe");

  if (settings.loading) return <Loader />;

  return (
    <Fragment>
      <Helper
        text="Need help? Refer to the Stripe setup guide"
        url="https://docs.Sample.app/Sample-server/installation/stripe-setup"
      />

      <Form
        inputs={{
          test_pk: {
            label: "Test Publishable API Key",
            type: "text",
            required: true,
            placeholder: "pk_test",
            value: settings?.data?.publishableAPIKey,
            errorMessage: "Please enter your test publishable API key",
          },
          test_sk: {
            label: "Test Secret API Key",
            type: "text",
            required: true,
            placeholder: "sk_test",
            value: settings?.data?.secretAPIKey,
            errorMessage: "Please enter your test secret API key",
          },
          header: {
            type: "header",
            title: "Live Publishable Key",
            label:
              "Please also add your live secret key to your development environment",
          },
          live_pk: {
            label: "Live Publishable API Key",
            type: "text",
            placeholder: "pk_live",
            errorMessage: "Please enter your publishable API key",
          },
          live_sk: {
            label: "Live Secret API Key",
            type: "text",
            placeholder: "sk_live",
            errorMessage: "Please enter your secret API key",
          },
          freePlan: {
            label: "Include a free plan",
            type: "switch",
            default: true,
          },
        }}
        url="/api/setup/stripe"
        method="POST"
        buttonText="Save"
      />
    </Fragment>
  );
}
