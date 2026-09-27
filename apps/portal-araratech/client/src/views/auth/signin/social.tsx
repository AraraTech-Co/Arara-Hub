// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SOCIAL SIGN IN
 *   After social authentication has been completed on the server
 *   the user is redirected back to this view - which obtains
 *   the token and completes the signin flow as normal
 *
 **********/

import React, { useContext, useEffect, useRef } from "react";
import axios from "axios";
import {
  Animate,
  AuthContext,
  ViewContext,
  Card,
  Row,
  Message,
  useNavigate,
  useLocation,
} from "@/components/lib";

export function SocialSignin(props) {
  // wrap in useRef to prevent triggering useEffect multiple times
  // TODO: Type these two
  const authContext = useRef(useContext<any>(AuthContext));
  const viewContext = useRef(useContext<any>(ViewContext));
  // ------------------ //
  const navigate = useNavigate();
  const location = useLocation();

  const qs = location.search;
  const provider = qs.substring(qs.indexOf("?provider") + 10, qs.indexOf("&"));
  const token = qs.substring(qs.indexOf("&token") + 7);

  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await axios({
          method: "post",
          url: "/api/auth",
          data: { token: token },
        });
        res.data["2fa_required"]
          ? navigate(`/signin/otp?token=${res.data.token}`)
          : authContext.current.signin(res);
      } catch (err) {
        viewContext.current.handleError(err);
      }
    }

    if (token) fetchToken();
  }, [token, viewContext, authContext, navigate]);

  return (
    <Animate type="pop">
      <Row
        title={`Signing in with ${provider.charAt(0).toUpperCase() + provider.slice(1)}`}
      >
        <Card loading={token}>
          {!token && (
            <div style={{ width: "32em", margin: "0 auto" }}>
              <Message
                type="error"
                title={`Something wen't wrong`}
                text="Invalid URL, please try in again"
                buttonText="Sign In"
                buttonLink="/signin"
              />
            </div>
          )}
        </Card>
      </Row>
    </Animate>
  );
}
