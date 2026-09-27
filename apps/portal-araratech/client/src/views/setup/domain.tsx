// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SETUP DOMAIN
 *   Configure your production domain
 *
 **********/

import React, { Fragment } from "react";
import { Form, Loader, useAPI } from "@/components/lib";

export function SetupDomain(props) {
  const domain = useAPI("/api/setup/domain");

  if (domain.loading) return <Loader />;

  return (
    <Fragment>
      <Form
        inputs={{
          domain: {
            label: "Production Domain",
            type: "text",
            required: true,
            value: domain?.data?.production_domain || "https://",
            placeholder: "https://yourapp.com",
            errorMessage: "Please enter your production domain",
          },
          support_email: {
            label: "Support Email Address",
            type: "email",
            required: true,
            value: domain?.data?.support_email,
            placeholder: "support@yourapp.com",
            errorMessage: "Please provide a support email",
          },
        }}
        url="/api/setup/domain"
        method="POST"
        buttonText="Save"
      />
    </Fragment>
  );
}
