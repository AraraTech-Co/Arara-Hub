import React from 'react';
/***
*
*   LOGO
*   Replace the image in /images with your own logo
*
**********/

import { Link, ClassHelper } from 'components/lib';
import LogoWhite from './images/logo-white.svg';
import LogoMarkWhite from './images/logo-mark-white.svg';
import LogoColor from './images/logo-color.svg';
import LogoMarkColor from './images/logo-mark-color.svg';
import Style from './logo.tailwind';

export function Logo(props){

  const Logo = {
    color: {
      logo: LogoColor,
      mark: LogoMarkColor 
    },
    white: {
      logo: LogoWhite,
      mark: LogoMarkWhite
    }
  }

  const logoStyle = ClassHelper(Style, props);
  
  return(
    <Link url='/' className={ logoStyle }>
      <img src={ Logo[props.color ? 'color' : 'white'][props.mark ? 'mark' : 'logo'] } alt='Logo' />
    </Link>
  )
}
