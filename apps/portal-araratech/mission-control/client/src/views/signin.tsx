import React from 'react';
/***
*
*   SIGN IN
*   Sign in 
*
**********/

import { useContext } from 'react';
import { Animate, AuthContext, Form, Card, Row } from 'components/lib';

export function Signin(props){

  // context
  const context = useContext(AuthContext);
  
  return(
    <Animate type='pop'>
      <Row title='Sign in to Mission Control'>
        <Card restrictWidth center>
          <Form
            inputs={{
              email: {
                label: 'Email',
                type: 'email',
                required: true,
              },
              password: {
                label: 'Password',
                type: 'password',
                required: true,
              }
            }}
            method='POST'
            buttonText='Sign In'
            url={ `${context.remote_server}/api/auth` }
            callback={ context.signin }
          />

        </Card>
      </Row>
    </Animate>
  );
}
