// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SETUP AUTHENTICATION
 *   Configure networks for social sign in
 *
 **********/

import React, { Fragment } from "react";
import { Form, Helper } from "@/components/lib";

export function SetupAuth(props) {
  return (
    <Fragment>
      <Helper
        text="Need help? Refer to the setup guide"
        url="https://docs.Sample.app/Sample-server/authentication/social-sign-on"
      />

      <Form
        inputs={{
          facebook_app_id: {
            type: "password",
            label: "Facebook App ID",
          },
          facebook_app_secret: {
            type: "password",
            label: "Facebook App Secret",
          },
          twitter_api_key: {
            type: "password",
            label: "Twitter App ID",
          },
          twitter_api_secret: {
            type: "password",
            label: "Twitter API Secret",
          },
        }}
        url="/api/setup/auth"
        method="POST"
        buttonText="Save"
      />
    </Fragment>
  );
}
