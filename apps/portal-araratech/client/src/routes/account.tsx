import { Account } from "@/views/account";
import { Profile } from "@/views/account/profile";
import { Billing } from "@/views/account/billing";
import { Upgrade } from "@/views/account/upgrade";
import { Users } from "@/views/account/users";
import { Password } from "@/views/account/password";
import { TwoFA } from "@/views/account/2fa";
import { APIKeyList } from "@/views/account/apikey/list";
import { APIKeyEditor } from "@/views/account/apikey/edit";

interface AccountRoutes {
  path: string;
  view: React.ComponentType;
  layout: string;
  permission: string;
  title: string;
}

const Routes: AccountRoutes[] = [
  {
    path: "/account",
    view: Account,
    layout: "app",
    permission: "user",
    title: "Your Account",
  },
  {
    path: "/account/profile",
    view: Profile,
    layout: "app",
    permission: "user",
    title: "Your Profile",
  },
  {
    path: "/account/password",
    view: Password,
    layout: "app",
    permission: "user",
    title: "Change Password",
  },
  {
    path: "/account/2fa",
    view: TwoFA,
    layout: "app",
    permission: "user",
    title: "Manage 2FA",
  },
  {
    path: "/account/billing",
    view: Billing,
    layout: "app",
    permission: "owner",
    title: "Billing",
  },
  {
    path: "/account/upgrade",
    view: Upgrade,
    layout: "app",
    permission: "owner",
    title: "Upgrade",
  },
  {
    path: "/account/users",
    view: Users,
    layout: "app",
    permission: "admin",
    title: "Users",
  },
  {
    path: "/account/apikeys",
    view: APIKeyList,
    layout: "app",
    permission: "developer",
    title: "API Keys",
  },
  {
    path: "/account/apikeys/create",
    view: APIKeyEditor,
    layout: "app",
    permission: "developer",
    title: "API Keys",
  },
  {
    path: "/account/apikeys/edit",
    view: APIKeyEditor,
    layout: "app",
    permission: "developer",
    title: "API Keys",
  },
];

export default Routes;
