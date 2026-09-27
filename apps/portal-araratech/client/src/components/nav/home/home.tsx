/***
 *
 *   HOME NAV
 *   Navigation used on the main external website. Renders a dashboard link
 *   if the user is signed in, or a sign up link if they are not
 *
 **********/

import { Fragment, useContext } from "react";
import {
  AuthContext,
  Logo,
  Link,
  Button,
  Content,
  ClassHelper,
} from "@/components/lib";
import Style from "./home.tailwind";

export function HomeNav(props) {
  // context
  const context = useContext<any>(AuthContext); // TODO: Type this
  console.log("HomeNav props:", props);
  console.log("AuthContext data:", context);

  const css = ClassHelper(Style, {
    wrapper: true,
    color: !props.transparent,
    transparent: props.transparent,
  });

  return (
    <section className={css}>
      <Content>
        <Logo className={Style.logo} />
        <nav className={Style.nav}>
          <Link
            url="/pricing"
            text="Pricing"
            className={Style.link}
            color="white"
          />

          {context.user?.token ? (
            <Button
              small
              goto="/dashboard"
              text="Dashboard"
              className={Style.button}
            />
          ) : (
            <Fragment>
              <Link
                url="/signin"
                text="Sign In"
                className={Style.link}
                color="white"
              />
              <Button
                small
                goto="/signup"
                text="Sign Up"
                className="inline-block"
              />
            </Fragment>
          )}
        </nav>
      </Content>
    </section>
  );
}
