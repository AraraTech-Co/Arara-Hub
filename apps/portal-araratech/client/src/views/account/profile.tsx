// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   PROFILE
 *   Update the user profile or close the account
 *
 **********/

import React, { Fragment, useContext } from "react";
import {
  AuthContext,
  ViewContext,
  Form,
  Card,
  AccountNav,
  Button,
  useNavigate,
  Animate,
  useAPI,
  Event,
} from "@/components/lib";

export function Profile(props) {
  const navigate = useNavigate();

  // context
  const authContext = useContext<any>(AuthContext); // TODO: Type this
  const viewContext = useContext<any>(ViewContext); // TODO: Type this
  // fetch
  const user = useAPI("/api/user");
  console.log("Profile props:", props);
  console.log("AuthContext data:", authContext);
  console.log("ViewContext data:", viewContext);
  console.log("Fetched user data:", user?.data);

  function closeAccount() {
    viewContext.modal.show(
      {
        title: "Close Your Account",
        form: {},
        buttonText: "Close Account",
        url: authContext.permission.owner ? "/api/account" : "/api/user",
        method: "DELETE",
        destructive: true,
        text:
          "Are you sure you want to delete your account? " +
          "You will lose all of your data and this can not be undone.",
      },
      () => {
        // destory user
        Event("closed_account");
        localStorage.clear();
        navigate("/signup");
      },
    );
  }

  return (
    <Fragment>
      <AccountNav />
      <Animate>
        <Card title="Edit Your Profile" loading={user.loading} restrictWidth>
          {user?.data && (
            <Form
              buttonText="Save"
              url="/api/user"
              method="PATCH"
              inputs={{
                name: {
                  label: "Your Name",
                  type: "text",
                  required: true,
                  value: user.data.name,
                  errorMessage: "Please enter your name",
                },
                email: {
                  label: "Email address",
                  type: "email",
                  required: true,
                  value: user.data.email,
                  errorMessage: "Please enter your email address",
                },
                ...(user.data.permission === "owner" && {
                  account_name: {
                    type: "text",
                    label: "Account Name",
                    value: user.data.account_name,
                  },
                }),
                ...(user.data.accounts?.length > 1 && {
                  default_account: {
                    label: "Default Account",
                    type: "select",
                    default: user.data.default_account,
                    options: user.data.accounts.map((x) => {
                      return {
                        value: x.id,
                        label: x.name,
                      };
                    }),
                  },
                }),
              }}
              callback={(res) => {
                // update the account name
                if (authContext.user?.accounts?.length > 0) {
                  const accounts = [...authContext.user.accounts];
                  accounts[
                    accounts.findIndex(
                      (x) => x.id === authContext.user.account_id,
                    )
                  ].name = res.data.data.account_name;
                  authContext.update({ accounts: accounts });
                }

                // update the user name
                authContext.update({ name: res.data.data.name });
              }}
            />
          )}

          <Fragment>
            <br />
            <Button textOnly action={closeAccount} text="Close Your Account" />
          </Fragment>
        </Card>
      </Animate>
    </Fragment>
  );
}
