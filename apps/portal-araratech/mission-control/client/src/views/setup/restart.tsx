import React from 'react';
/***
*
*   SETUP RESTART
*   You can delete this when you've completed the setup process.
*
**********/

import { Message } from 'components/lib';

export function SetupRestart(props){

  return(
    <Message
      type='warning'
      title='Restart Your Server'
      text='Please restart your node server with npm run dev to ensure all settings take effect before proceeding.'
     />
  );
}
