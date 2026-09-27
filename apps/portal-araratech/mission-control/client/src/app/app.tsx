import React, { useState, useEffect } from "react";
import Axios from "axios";

// components
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrivateRoute, AuthProvider } from "./auth";
import { View } from "components/lib";
import { NotFound } from "views/404";
import Settings from "settings.json";

// tailwind css
import "../css/output.css";

export default function App(props) {
  const [routes, setRoutes] = useState([]);
  const user = JSON.parse(localStorage.getItem("user"));

  Axios.defaults.baseURL =
    Settings[process.env.NODE_ENV].server_url || "http://localhost:5001";

  if (user?.token) {
    // add auth token to api header calls
    Axios.defaults.headers.common["Authorization"] = "Bearer " + user.token;
  }

  useEffect(() => {
    const loadRoutes = async () => {
      const mainRoutes = await import("routes").then((mod) => mod.default);
      const setupRoutes = await import("routes/setup").then(
        (mod) => mod.default,
      );
      setRoutes([...mainRoutes, ...setupRoutes]);
    };

    loadRoutes();
  }, []);

  // render the routes
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {routes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                route.permission ? (
                  <PrivateRoute permission={route.permission}>
                    <View
                      display={route.view}
                      layout={route.layout}
                      title={route.title}
                    />
                  </PrivateRoute>
                ) : (
                  <View
                    display={route.view}
                    layout={route.layout}
                    title={route.title}
                  />
                )
              }
            />
          ))}

          {/* 404 */}
          <Route
            path="*"
            element={
              <View display={NotFound} layout="home" title="404 Not Found" />
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
