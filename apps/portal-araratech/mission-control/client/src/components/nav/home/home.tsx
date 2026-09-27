import React from 'react';
/***
*
*   HOME NAV
*   Navigation used on the main external website. Renders a dashboard link
*   if the user is signed in, or a sign-up link if they are not
*
**********/

import { useContext } from 'react';
import { AuthContext, Logo, Button, Content, ClassHelper } from 'components/lib';
import Style from './home.tailwind';

export function HomeNav(props){

  // context
  const context = useContext(AuthContext);

  const css = ClassHelper(Style, {

    wrapper: true,
    color: !props.transparent,
    transparent: props.transparent

  });

  return(
    <section className={ css }>
      <Content>

        <Logo className={ Style.logo }/>

        <nav className={ Style.nav }>
          { context.user?.token &&
            <Button small url='/dashboard' className={ Style.button } text='Dashboard' /> }
        </nav>

      </Content>
    </section>
  );
}