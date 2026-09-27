import Axios from "axios";

// components
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrivateRoute, AuthProvider } from "./auth";
import { View } from "@/components/lib";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

// 404
import { NotFound } from "@/views/error/404";

// tailwind css
import "../css/output.css";

// settings
const Settings = require("settings.json");
const StripePromise = loadStripe(
  Settings[process.env.NODE_ENV].stripe.publishableAPIKey,
);

const routes = [
  ...require("routes/setup").default,
  ...require("routes/account").default,
  ...require("routes/app").default,
  ...require("routes/auth").default,
  ...require("routes/website").default,
];

export default function App(props) {
  const user = JSON.parse(localStorage.getItem("user"));
  Axios.defaults.baseURL = Settings[process.env.NODE_ENV].server_url;

  if (user?.token) {
    // add auth token to api header calls
    Axios.defaults.headers.common["Authorization"] = "Bearer " + user.token;
  }

  // render the routes
  return (
    <Elements stripe={StripePromise}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {routes.map((route) => {
              return (
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
              );
            })}

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
    </Elements>
  );
}
