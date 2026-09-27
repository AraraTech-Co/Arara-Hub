// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SETUP MAILGUN
 *   Connects your Mailgun account for sending email notifications.
 *   You can delete this when you've completed the setup process.
 *
 **********/

import React, { Fragment } from "react";
import { Form, Helper, Loader, useAPI } from "@/components/lib";

export function SetupMailgun(props) {
  const settings = useAPI("/api/setup/mailgun");

  if (settings.loading) return <Loader />;

  return (
    <Fragment>
      <Helper
        text="Need help? Refer to the Mailgun setup guide"
        url="https://docs.Sample.app/Sample-server/installation/mailgun-setup"
      />

      <Form
        inputs={{
          apiKey: {
            label: "API Key",
            type: "text",
            required: true,
            value: settings?.data?.apiKey,
            errorMessage: "Please enter your Mailgun API Key",
          },
          domain: {
            label: "Mail Domain",
            type: "url",
            required: true,
            placeholder: "mail.domain.com",
            value: settings?.data?.domain,
            errorMessage: "Please enter your mailing domain",
          },
          host: {
            label: "Host (Region)",
            type: "select",
            default: "api.mailgun.net",
            options: [
              { value: "api.mailgun.net", label: "US" },
              { value: "api.eu.mailgun.net", label: "EU" },
            ],
          },
          sender: {
            label: "Sender Address",
            type: "text",
            required: true,
            value: settings?.data?.sender,
            placeholder: "Sender Name <name@domain.com>",
            errorMessage: "Please enter your sender address",
          },
        }}
        url="/api/setup/mailgun"
        method="POST"
        buttonText="Save"
      />
    </Fragment>
  );
}
