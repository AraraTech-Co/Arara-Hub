// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   RESET PASSWORD
 *   User can set a new password using the token
 *
 **********/

import React, { useContext } from "react";
import {
  Animate,
  Row,
  AuthContext,
  Card,
  Form,
  useNavigate,
  useLocation,
} from "@/components/lib";

export function ResetPassword(props) {
  // context
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContext(AuthContext);

  // check for token
  const qs = location.search;
  const token = qs.substring(qs.indexOf("?token=") + 7);

  return (
    <Animate type="pop">
      <Row title="Reset Your Password">
        <Card restrictWidth center>
          <Form
            inputs={{
              jwt: {
                type: "hidden",
                value: token,
              },
              email: {
                label: "Email",
                type: "email",
                required: true,
              },
              password: {
                label: "New Password",
                type: "password",
                required: true,
                complexPassword: true,
              },
            }}
            url="/api/auth/password/reset"
            method="POST"
            buttonText="Set New Password"
            callback={(res) => {
              res.data["2fa_required"]
                ? navigate(`/signin/otp?token=${res.data.token}`)
                : context.signin(res);
            }}
          />
        </Card>
      </Row>
    </Animate>
  );
}
