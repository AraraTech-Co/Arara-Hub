/***
 *
 *   ONBOARDING
 *   Example of onboarding flow*
 *
 **********/

import React, { Fragment, useContext } from "react";
import { AuthContext, Onboarding, Form, Message } from "@/components/lib";

export function OnboardingView(props) {
  const context = useContext(AuthContext);
  const views = [
    {
      name: "Getting Started",
      description: `Welcome, ${context.user.name}!`,
      component: <Welcome />,
    },
  ];

  if (context.permission.admin) {
    views.push({
      name: "Invite your team",
      description: "Invite your team.",
      component: <InviteUsers />,
    });
  }

  if (context.user.duplicate_user) {
    views.unshift({
      name: "Important!",
      description: "",
      component: <DuplicateUser />,
    });
  }

  return <Onboarding save onFinish="/dashboard" views={views} />;
}

function DuplicateUser() {
  return (
    <Message
      type="warning"
      title={`You already have an account`}
      text="We noticed you have already registered an account, so we used your original password to save you any confusion in the future."
    />
  );
}

function Welcome() {
  return (
    <Fragment>
      <p>
        This is an example of the user-onboarding flow. You can replace this
        with your own content, try out the action in the next step or skip the
        intro entirely.
      </p>

      <p>
        <strong>Customize the Sample 🛠 </strong>
      </p>
    </Fragment>
  );
}

function InviteUsers(props) {
  return (
    <Form
      inputs={{
        email: {
          label: "Email",
          type: "email",
          required: true,
        },
      }}
      buttonText="Send Invite"
      url="/api/invite"
      method="POST"
    />
  );
}
