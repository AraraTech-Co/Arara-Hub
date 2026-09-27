// Converted to TypeScript
/* Add appropriate types here */
import React, { useContext } from "react";
import {
  AuthContext,
  Animate,
  Row,
  Card,
  Form,
  useNavigate,
  useLocation,
} from "@/components/lib";

export function SigninOTP(props) {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContext(AuthContext);

  const token = location?.search?.substring(7);
  if (!token) navigate("/signin");

  return (
    <Animate type="pop">
      <Row
        title="Enter Verification Code"
        desc="Please enter the the verification code from your authenticator app"
      >
        <Card restrictWidth center>
          <Form
            method="post"
            url="/api/auth/otp"
            inputs={{
              code: {
                type: "text",
                label: "Verification code",
                required: true,
              },
              jwt: {
                type: "hidden",
                value: token,
              },
            }}
            buttonText="Complete Sign In"
            callback={context.signin}
          />

          <div className="mt-4">
            Lost access to your authenticator app? Please enter your backup code
            above.
          </div>
        </Card>
      </Row>
    </Animate>
  );
}
