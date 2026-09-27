/***
 *
 *   ACCOUNT
 *   Index page for account functions
 *
 **********/

import React, { useContext } from "react";
import {
  AuthContext,
  Animate,
  Grid,
  Card,
  Icon,
  Link,
  useAPI,
  Loader,
} from "@/components/lib";

export function Account(props) {
  const context = useContext<any>(AuthContext);
  const user = useAPI("/api/user");
  const iconSize = 20;

  if (user.loading) return <Loader />;

  return (
    <Animate>
      <Grid cols="4">
        <Card>
          <Icon image="user" size={iconSize} />
          <h2 className={Style.subtitle}>Profile</h2>
          <div>Update your profile information</div>
          <Link url="/account/profile" className={Style.link}>
            Update
          </Link>
        </Card>

        <Card>
          <Icon image="lock" size={iconSize} />
          <h2 className={Style.subtitle}>Password</h2>
          <div>
            {user?.data?.["has_password"]
              ? "Change your password"
              : "Create a password"}
          </div>
          <Link url="/account/password" className={Style.link}>
            {user?.data?.["has_password"] ? "Change" : "Create"}
          </Link>
        </Card>

        <Card>
          <Icon image="shield" size={iconSize} />
          <h2 className={Style.subtitle}>Two-Factor Authentication</h2>
          <div>Secure your account</div>
          <Link url="/account/2fa" className={Style.link}>
            {user?.data?.["2fa_enabled"] ? "Manage" : "Enable"}
          </Link>
        </Card>

        {context.permission?.owner && (
          <Card>
            <Icon image="credit-card" size={iconSize} />
            <h2 className={Style.subtitle}>Billing</h2>
            <div>Update your plan or credit card</div>
            <Link url="/account/billing" className={Style.link}>
              Manage
            </Link>
          </Card>
        )}

        {context.permission?.developer && (
          <Card>
            <Icon image="settings" size={iconSize} />
            <h2 className={Style.subtitle}>API Keys</h2>
            <div>Manage your API keys</div>
            <Link url="/account/apikeys" className={Style.link}>
              Manage
            </Link>
          </Card>
        )}

        {context.permission?.admin && (
          <Card>
            <Icon image="users" size={iconSize} />
            <h2 className={Style.subtitle}>Users</h2>
            <div>Invite users to your account</div>
            <Link url="/account/users" className={Style.link}>
              Add users
            </Link>
          </Card>
        )}
      </Grid>
    </Animate>
  );
}

const Style = {
  subtitle: "font-bold mt-4",
  link: "text-blue-500 font-semibold mt-3 inline-block",
};
