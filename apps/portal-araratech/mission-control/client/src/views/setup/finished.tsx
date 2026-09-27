import React from 'react';
/***
*
*   SETUP FINAL SCREEN
*   You can delete this when you've completed the setup process.
*
**********/

import { Message, useNavigate } from 'components/lib';

export function SetupFinished(props){

  const navigate = useNavigate();

  return(
    <Message
      type='success'
      title='Setup Complete'
      text={ 'Please delete all the setup files from this application and log in with the account you just created.' }
      buttonText='Sign In'
      buttonAction={ () => navigate('/signin' )}
     />
  );
}
