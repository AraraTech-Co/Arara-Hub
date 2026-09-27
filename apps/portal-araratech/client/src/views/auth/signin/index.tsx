// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SIGN IN
 *   Sign in form for all account types (including master).
 *
 **********/

import React, { useContext, useState, useEffect } from "react";
import {
  Animate,
  AuthContext,
  ViewContext,
  Button,
  Form,
  Card,
  Link,
  Row,
  Message,
  SocialSignin,
  useLocation,
  useNavigate,
} from "@/components/lib";

export function Signin(props) {
  // context
  // TODO: Type these two
  const authContext = useContext<any>(AuthContext);
  const viewContext = useContext<any>(ViewContext);
  // --------------------
  const location = useLocation();
  const navigate = useNavigate();

  // state
  const [useMagic, setUseMagic] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [form, setForm] = useState({
    email: {
      label: "Email",
      type: "email",
      required: true,
    },
    password: {
      label: "Password",
      type: "password",
      required: true,
    },
    forgotpassword: {
      type: "link",
      url: "/forgotpassword",
      text: "Forgot your password?",
    },
  });

  useEffect(() => {
    // was an error message passed from the server router?
    const qs = location.search;

    if (qs.includes("error")) {
      const msg = decodeURIComponent(qs.substring(qs.indexOf("?error=") + 7));
      viewContext.notification.show(msg, "error");
    }
  }, [location.search, viewContext.notification]);

  function toggleMagicLink(useMagic) {
    const f = { ...form };
    f.password.type = useMagic ? "hidden" : "password";
    f.password.required = useMagic ? false : true;
    f.forgotpassword.type = useMagic ? "hidden" : "link";

    setForm(f);
    setUseMagic(useMagic);
  }

  return (
    <Animate type="pop">
      <Row title="Sign in to Sample">
        {magicLinkSent ? (
          <div style={{ width: "28em", margin: "0 auto" }}>
            <Message
              title="Check Your Email"
              type="success"
              text="Please click the link in your email inbox to sign in."
            />
          </div>
        ) : (
          <Card restrictWidth center>
            <SocialSignin
              network={["facebook", "twitter"]}
              showOr
            />

            {useMagic ? (
              <Button
                text="Use password"
                color="blue"
                icon="shield"
                iconColor="white"
                className="mx-auto mb-5"
                rounded
                iconButton
                small
                action={() => {
                  toggleMagicLink(false);
                }}
              />
            ) : (
              <Button
                text="Use magic link instead"
                color="blue"
                icon="star"
                iconColor="white"
                className="mx-auto mb-5"
                rounded
                iconButton
                small
                action={() => {
                  toggleMagicLink(true);
                }}
              />
            )}

            <Form
              inputs={form}
              method="POST"
              url={useMagic ? "/api/auth/magic" : "/api/auth"}
              buttonText={useMagic ? "Send Magic Link" : "Sign In"}
              callback={(res) => {
                useMagic
                  ? setMagicLinkSent(true)
                  : res.data["2fa_required"]
                    ? navigate(`/signin/otp?token=${res.data.token}`)
                    : navigate(authContext.signin(res));
              }}
            />

            <div className="mt-4">
              Don't have an account? <Link url="/signup" text="Sign Up" />
            </div>
          </Card>
        )}
      </Row>
    </Animate>
  );
}
