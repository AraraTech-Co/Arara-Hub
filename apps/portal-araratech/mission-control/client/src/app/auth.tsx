/***
 *
 *   AUTHENTICATION
 *   Auth provider to manage auth functions throughout
 *   the application. <PrivateRoute> component to
 *   protect internal application routes from unauthenticated
 *   access.
 *
 **********/

import React, { useState } from "react";
import axios from "axios";
import Settings from "settings.json";
import { Navigate } from "react-router-dom";

// auth context
export const AuthContext = React.createContext(undefined);

const permissions = import("./permissions.json");

export function AuthProvider(props) {
  const cache = JSON.parse(localStorage.getItem("user"));
  const [user, setUser] = useState<any>(cache); // TODO: Type this

  function signin(res, impersonate) {
    if (res.data) {
      localStorage.setItem("user", JSON.stringify(res.data));
      axios.defaults.headers.common["Authorization"] =
        "Bearer " + res.data.token;

      if (res.data.permission !== "master")
        return (window.location.href = "/signin");

      return (window.location.href = impersonate
        ? `${Settings[process.env.NODE_ENV].remote_client}/dashboard`
        : "/dashboard");
    }
  }

  async function signout() {
    axios({
      method: "delete",
      url: `${Settings[process.env.NODE_ENV].server_url}/api/auth`,
    });
    localStorage.clear();
    window.location.href = "/signin";
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
        remote_server: Settings[process.env.NODE_ENV].remote_server,
        permission: permissions[user?.permission],
      }}
      {...props}
    />
  );
}

// custom route object checks for an auth token before
// rendering the route – redirects if token is not present
export function PrivateRoute(props) {
  // check user
  const user = JSON.parse(localStorage.getItem("user"));

  if (user?.token && permissions[user.permission][props.permission])
    return props.children;

  // user is not authenticated
  return <Navigate to="/signin" />;
}
