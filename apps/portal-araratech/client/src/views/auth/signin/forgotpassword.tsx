// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   FORGOT PASSWORD
 *   Trigger a password reset process
 *
 **********/

import React from "react";
import { Animate, Row, Form, Card } from "@/components/lib";

export function ForgotPassword(props) {
  return (
    <Animate type="pop">
      <Row title="Reset Your Password">
        <Card restrictWidth center>
          <p className="mb-5">
            Enter your email address and we'll send you instructions to reset
            your password.
          </p>

          <Form
            inputs={{
              email: {
                label: "Email",
                type: "email",
                required: true,
              },
            }}
            url="/api/auth/password/reset/request"
            method="POST"
            buttonText="Reset Password"
          />
        </Card>
      </Row>
    </Animate>
  );
}
