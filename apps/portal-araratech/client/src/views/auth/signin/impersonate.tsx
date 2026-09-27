// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   IMPERSONATE
 *   Allows a Master account to log into a user account via Mission Control
 *
 **********/

import React, { useContext, useEffect, useRef } from "react";
import Axios from "axios";
import {
  AuthContext,
  Animate,
  Row,
  Message,
  useNavigate,
  useLocation,
} from "@/components/lib";

export function ImpersonateSignin(props) {
  const navigate = useNavigate();
  const location = useLocation();
  const qs = location.search;
  const context = useRef(useContext(AuthContext));

  useEffect(() => {
    const verifyToken = async (token) => {
      try {
        const res = await Axios.post("/api/auth/impersonate", { token: token });
        res.status === 200 ? context.current.signin(res) : navigate("/signin");
      } catch (err) {
        navigate("/signin");
      }
    };

    if (qs.includes("?token=")) {
      // check token exists
      verifyToken(qs.substring(qs.indexOf("?token=") + 7));
    } else {
      navigate("/404");
    }
  }, [qs, context, navigate]);

  return (
    <Animate>
      <Row>
        <div style={{ width: "28em", margin: "0 auto" }}>
          <Message
            type="info"
            title="Signing you in"
            text="Signing you in via Mission Control"
          />
        </div>
      </Row>
    </Animate>
  );
}
