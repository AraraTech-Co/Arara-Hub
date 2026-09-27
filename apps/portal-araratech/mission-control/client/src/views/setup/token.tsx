import React from 'react';
/***
*
*   SETUP SECRET
*   Add the TOKEN_SECRET from your main application
*
**********/

import { Fragment } from 'react';
import { Form, Message } from 'components/lib';

export function SetupToken(props){
 
  return(
    <Fragment>

      <Message
        type='warning'
        text='Use the same TOKEN_SECRET from the .env file in your main application'
      />

      <Form
        inputs={{
          token_secret: {
            label: 'Token Secret',
            type: 'text',
            required: true,
            errorMessage: 'Please enter your TOKEN_SECRET'
          },
        }}
        url='/api/setup/token'
        method='POST'
        buttonText='Save'
      />
    </Fragment>
  );
}
