// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SIGN UP (user)
 *   Signup form for child users
 *
 **********/

import React, { useContext } from "react";
import {
  Animate,
  Row,
  AuthContext,
  Card,
  Form,
  Link,
  SocialSignin,
} from "@/components/lib";

export function SignupUser(props) {
  const context = useContext(AuthContext);
  const url = window.location.href;
  const id = url.substring(url.indexOf("?id=") + 4, url.indexOf("&email"));
  const email = url.substring(url.indexOf("&email") + 7);

  return (
    <Animate type="pop">
      <Row title="Create Your Account">
        <Card restrictWidth center>
          <SocialSignin network={["facebook", "twitter"]} showOr invite={id} />

          <Form
            inputs={{
              name: {
                label: "First Name",
                value: "",
                type: "text",
                required: true,
                errorMessage: "Please enter your first name",
              },
              email: {
                label: "Email",
                value: email,
                type: "email",
                required: true,
              },
              password: {
                label: "Password",
                type: "password",
                required: true,
                complexPassword: true,
              },
              confirm_password: {
                type: "hidden",
                value: null,
              },
              invite_id: {
                type: "hidden",
                value: id,
              },
            }}
            url="/api/user"
            method="POST"
            redirect="/dashboard"
            buttonText="Create Account"
            callback={context.signin}
          />

          <div className="mt-4">
            Already registered? <Link url="/signin" text="Sign In" />
          </div>
        </Card>
      </Row>
    </Animate>
  );
}
