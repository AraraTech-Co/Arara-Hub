/***
 *
 *   APP LAYOUT
 *   Main application layout containing the navigation
 *   and header (title, secondary nav and signed in user)
 *
 *   PROPS
 *   title: title of the view
 *
 **********/

import { Fragment, useContext } from "react";
import { AuthContext, AppNav, Header, User } from "@/components/lib";
import Style from "./app.module.scss";

export function AppLayout(props) {
  // context & style
  const context = useContext<any>(AuthContext); // TODO: Type this

  const navItems = [
    { label: "Dashboard", icon: "activity", link: "/dashboard" },
    { label: "Account", icon: "user", link: "/account" },
    ...(context.permission?.sales
      ? [{ label: "Vendas", icon: "users", link: "/sales" }]
      : []),
    ...(context.permission?.agent
      ? [{ label: "Chamados", icon: "inbox", link: "/tickets" }]
      : []),
    { label: "Help", icon: "help-circle", link: "/help" },
    { label: "Sign Out", icon: "log-out", action: context.signout },
  ];

  return (
    <Fragment>
      <AppNav items={navItems} />

      <main className={Style.app}>
        <Header title={props.title}>
          <User />
        </Header>

        {<props.children {...props.data} />}
      </main>
    </Fragment>
  );
}
