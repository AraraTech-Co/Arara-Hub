import React from 'react';
/***
*
*   SETUP URLS
*   Configure your main application URLs
*
**********/

import { Form, Loader, useAPI } from 'components/lib';

export function SetupURL(props){

  const url = useAPI('/api/setup/url');

  if (url.loading)
    return <Loader />

  return(
    <Form
      inputs={{
        remote_server: {
          label: 'Remote Server URL',
          type: 'text',
          required: true,
          value: url?.data?.remote_server || 'https://',
          placeholder: 'http://localhost:8080',
          errorMessage: 'Please enter your remote server URL'
        },
        remote_client: {
          label: 'Remote Client URL',
          type: 'text',
          required: true,
          value: url?.data?.remote_client || 'https://',
          placeholder: 'http://localhost:3000',
          errorMessage: 'Please enter your remote client URL'
        }
      }}
      url='/api/setup/url'
      method='POST'
      buttonText='Save'
    />
  );
}
