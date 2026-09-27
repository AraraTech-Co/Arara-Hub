import React from 'react';
/***
*
*   SETUP DATABASE
*   Saves your Stripe plans for managing user billing.
*   You can delete this when you've completed the setup process.
*
**********/

import { Form } from 'components/lib';

export function SetupStripe(props){

  return(
    <Form
      inputs={{
        test_sk: {
          label: 'Test Secret API Key',
          type: 'text',
          required: true,
          placeholder: 'sk_test',
          errorMessage: 'Please enter your test secret API key'
        },
        live_sk: {
          label: 'Live Secret API Key',
          type: 'text',
          placeholder: 'sk_live',
          errorMessage: 'Please enter your secret API key'
        },
        freePlan: {
          label: 'I have a free plan',
          type: 'switch',
          default: false,
        }
      }}
      url='/api/setup/stripe'
      method='POST'
      buttonText='Save'
    />
  );
}
