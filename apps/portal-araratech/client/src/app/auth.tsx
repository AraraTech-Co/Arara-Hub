/***
 *
 *   AUTHENTICATION
 *   Auth provider to manage auth functions throughout
 *   the application. <PrivateRoute> component to
 *   protect internal application routes from unauthenticated
 *   access.
 *
 **********/

import { useState, useEffect, createContext } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";

// auth context
export const AuthContext = createContext(undefined);

const useAPI = require("components/lib").useAPI;
const Event = require("components/lib").Event;
const permissions = require("./permissions");

export function AuthProvider(props) {
  const cache = JSON.parse(localStorage.getItem("user"));
  const [user, setUser] = useState(cache);
  const auth = useAPI(user ? "/api/auth" : null);

  useEffect(() => {
    // update the auth status
    if (!auth.loading && auth.data) {
      auth.data.authenticated ? update(auth.data) : signout();
    }
  }, [auth]);

  function signin(res: {
    data?: { token: string; plan?: boolean; onboarded?: boolean };
  }) {
    try {
      if (res?.data) {
        localStorage.setItem("user", JSON.stringify(res.data));

        axios.defaults.headers.common["Authorization"] =
          `Bearer ${res.data.token}`;

        Event("signin");

        if (!res.data.plan) {
          window.location.href = "/signup/plan";
          return;
        }

        window.location.href = res.data.onboarded ? "/dashboard" : "/welcome";
      }
    } catch (error) {
      console.error("Error during sign-in:", error);
    }
  }

  async function signout() {
    try {
      await axios({
        method: "delete",
        url: "/api/auth",
      });

      localStorage.clear();

      window.location.href = "/signin";
    } catch (error) {
      console.error("Error during signout:", error);

      localStorage.clear();
      window.location.href = "/signin";
    }
  }

  async function switchAccount(id) {
    const res = await axios({
      method: "post",
      url: "/api/auth/switch",
      data: { account: id },
    });

    if (res.data) signin(res);
  }

  function update(data) {
    if (localStorage.getItem("user")) {
      let user = JSON.parse(localStorage.getItem("user"));
      for (let key in data) {
        if (Array.isArray(data[key])) {
          user[key] = data[key];
        } else if (typeof data[key] === "object") {
          for (let innerKey in data[key]) {
            user[key][innerKey] = data[key][innerKey];
          }
        } else {
          user[key] = data[key];
        }
      }

      localStorage.setItem("user", JSON.stringify(user));
      setUser(user);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user: user,
        signin: signin,
        signout: signout,
        update: update,
        switchAccount: switchAccount,
        permission: permissions[user?.permission],
      }}
      {...props}
    />
  );
}

// custom route object checks for an auth token before
// rendering the route – redirects if token is not present
export function PrivateRoute(props) {
  // check user exists
  const user = JSON.parse(localStorage.getItem("user"));
  const path = window.location.pathname;
  const permittedRoutes = [
    "/account/billing",
    "/signup/plan",
    "/account/upgrade",
    "/account",
    "/account/profile",
    "/sales",
    "/tickets",
  ];

  const internalRoles = ["master", "sales", "agent"];

  if (user?.token) {
    if (permissions[user.permission][props.permission]) {
      // user has no plan
      if (!user.plan && path !== "/account/profile" && path !== "/signup/plan")
        return <Navigate to="/signup/plan" />;

      // user has no subscription
      if (
        user.subscription !== "active" &&
        user.subscription !== "trialing" &&
        !internalRoles.includes(user.permission) &&
        !permittedRoutes.includes(path)
      )
        return <Navigate to="/account/billing" />;

      // user is good
      return props.children;
    }
  }

  // user is not authenticated
  return <Navigate to="/signin" />;
}
