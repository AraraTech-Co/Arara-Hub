// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SETUP FINAL SCREEN
 *   You can delete this when you've completed the setup process.
 *
 **********/

import React, { Fragment } from "react";
import { Message } from "@/components/lib";

export function SetupFinished(props) {
  return (
    <Fragment>
      <Message
        type="success"
        title="Restart Your Server"
        text="Please restart your node server with npm run dev to ensure all settings take effect and then remove all setup files for security"
      />
    </Fragment>
  );
}
