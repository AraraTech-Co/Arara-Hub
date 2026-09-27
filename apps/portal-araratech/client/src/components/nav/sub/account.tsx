/***
 *
 *   ACCOUNT NAV
 *   Acount sub nav that renders different options based
 *   on user permissions. Shows billing & user admin to only account owners
 *
 **********/

import { SubNav } from "@/components/lib";

export function AccountNav(props) {
  return (
    <SubNav
      items={[
        { link: "/account/profile", label: "Profile" },
        { link: "/account/password", label: "Password" },
        { link: "/account/2fa", label: "2FA" },
        { link: "/account/billing", label: "Billing", permission: "owner" },
        {
          link: "/account/apikeys/",
          label: "API Keys",
          permission: "developer",
        },
        { link: "/account/users", label: "Users", permission: "admin" },
      ]}
    />
  );
}
