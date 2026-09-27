// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   HELP
 *   Information for user to get help and support
 *
 **********/

import React, { Fragment } from "react";
import { Card, Form, Message, Loader, useAPI } from "@/components/lib";

export function Help(props) {
  const user = useAPI("/api/user");

  return (
    <Fragment>
      <Message
        title="Need Help?"
        type="info"
        text="Contact our support team below. You can also enable or disable permission for our support team to access your account to help resolve any issues."
      />

      {user.loading ? (
        <Loader />
      ) : (
        <Card title="Contact Support" restrictWidth>
          <Form
            inputs={{
              support_enabled: {
                type: "radio",
                options: ["Yes", "No"],
                required: true,
                errorMessage: "Please enter a message",
                default: user.data?.support_enabled ? "Yes" : "No",
                label: "Can our support team access your account?",
              },
            }}
            submitOnChange
            method="PATCH"
            url="/api/user"
          />
          <Form
            inputs={{
              email: {
                type: "hidden",
                value: user?.data?.email,
              },
              name: {
                type: "hidden",
                value: user?.data?.name,
              },
              template: {
                type: "hidden",
                value: "help",
              },
              message: {
                type: "textarea",
                label: "What can we help with?",
                errorMessage: "Please enter a message",
                required: true,
              },
            }}
            method="POST"
            url="/api/utility/mail"
            buttonText="Send Message"
          />
        </Card>
      )}
    </Fragment>
  );
}
