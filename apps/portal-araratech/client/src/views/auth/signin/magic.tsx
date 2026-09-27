// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   MAGIC SIGN IN
 *   Confirms magic token and redirects to dashboard if successful
 *
 **********/

import React, { useState, useContext, useEffect, useRef } from "react";
import Axios from "axios";
import {
  AuthContext,
  Animate,
  Row,
  Message,
  useNavigate,
  useLocation,
} from "@/components/lib";

export function MagicSignin(props) {
  const navigate = useNavigate();
  const location = useLocation();
  const qs = location.search;
  const context = useRef(useContext(AuthContext));

  const [message, setMessage] = useState<any>({
    // TODO: Type this
    type: "success",
    title: "Using The Magic",
    text: "Signing you in now...",
  });

  useEffect(() => {
    const verifyToken = async (token) => {
      try {
        const res = await Axios.post("/api/auth/magic/verify", {
          token: token,
        });

        res.data["2fa_required"]
          ? navigate(`/signin/otp?token=${res.data.token}`)
          : res.status === 200
            ? context.current.signin(res)
            : invalidLink();
      } catch (err) {
        invalidLink();
      }
    };

    if (qs.includes("?token=")) {
      // check token exists
      verifyToken(qs.substring(qs.indexOf("?token=") + 7));
    } else {
      invalidLink();
    }
  }, [qs, context, navigate]);

  function invalidLink() {
    setMessage({
      type: "error",
      title: "Magic Link is invalid",
      text: "Please generate a new link and try again",
      buttonLink: "/signin",
      buttonText: "Back to Sign In",
    });
  }
  console.log("MagicSignin props:", props);
  console.log("AuthContext data:", context.current);
  console.log("Location search (qs):", qs);
  console.log("Message state:", message);
  return (
    <Animate>
      <Row>
        <div style={{ width: "28em", margin: "0 auto" }}>
          <Message
            type={message.type}
            title={message.title}
            text={message.text}
            buttonText={message.buttonText}
            buttonLink={message.buttonLink}
          />
        </div>
      </Row>
    </Animate>
  );
}
