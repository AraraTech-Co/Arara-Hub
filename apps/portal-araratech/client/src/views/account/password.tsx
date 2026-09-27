/***
 *
 *   PASSWORD
 *   Update the users password
 *
 *   if the user has a password show old and new inputs
 *   if no existing password (eg. in case of social signin)
 *   then allow the user to set a password on their account
 *
 **********/

import React, { Fragment, useContext, useState } from "react";
import {
  AuthContext,
  AccountNav,
  Animate,
  Card,
  Form,
  Message,
} from "@/components/lib";

export function Password(props) {
  const context = useContext<any>(AuthContext); // TODO: Type this
  const [done, setDone] = useState(false);
  console.log("Password props:", props);
  console.log("AuthContext data:", context);
  console.log("Password update state:", done);

  return (
    <Fragment>
      <AccountNav />
      <Animate>
        <Card
          title="Update Your Password"
          restrictWidth
          className={props.className}
        >
          {!done ? (
            <Form
              url="/api/user/password"
              method="PUT"
              buttonText="Save Password"
              inputs={{
                ...(context.user.has_password && {
                  oldpassword: {
                    label: "Old Password",
                    type: "password",
                    required: true,
                  },
                  has_password: {
                    type: "hidden",
                    value: true,
                  },
                }),
                newpassword: {
                  label: "Create New Password",
                  type: "password",
                  required: true,
                  complexPassword: true,
                },
              }}
              callback={() => {
                setDone(true);
                context.update({ has_password: true });
              }}
            />
          ) : (
            <Message
              title="Password Saved"
              type="success"
              text="Your new password has been saved successfully."
            />
          )}
        </Card>
      </Animate>
    </Fragment>
  );
}
