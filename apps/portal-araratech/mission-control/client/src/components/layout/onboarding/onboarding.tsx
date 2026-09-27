import React from 'react';
/***
*
*   ONBOARDING LAYOUT
*   Simple layout to focus on user onboarding actions
*
**********/

import { useEffect } from 'react';
import Style from './onboarding.tailwind';

export function OnboardingLayout(props){

  useEffect(() => {

    document.body.classList.add('color');
    return () => { document.body.classList.remove('color'); }

  }, [])

  return (
    <main className={ Style.onboarding }>

      { <props.children {...props.data }/> }

    </main>
  );
}
