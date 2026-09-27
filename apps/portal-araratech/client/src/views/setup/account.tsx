// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SETUP ACCOUNT
 *   Creates a master account for administering your application.
 *   You can delete this when you've completed the setup process.
 *
 **********/

import React, { Fragment } from "react";
import { Form, Message } from "@/components/lib";

export function SetupAccount(props) {
  return (
    <Fragment>
      <Message
        title="Warning"
        type="warning"
        text="Please use a strong password. Your master account can be used for user impersonation and administration"
      />

      <Form
        inputs={{
          email: {
            label: "Email",
            type: "email",
            required: true,
          },
          password: {
            label: "Password",
            type: "password",
            required: true,
            complexPassword: true,
          },
        }}
        url="/api/setup/account"
        method="POST"
        buttonText="Create Account"
      />
    </Fragment>
  );
}
