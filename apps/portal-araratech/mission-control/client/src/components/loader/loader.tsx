import React from 'react';
/***
*
*   LOADER
*   Infinite spinning animation for loading states
*
**********/

import Orbit from './images/orbit.svg';
import { ClassHelper } from 'components/lib';
import Style from './loader.tailwind';

export function Loader(props){

  const loaderStyle = ClassHelper(Style, props);

  return (
    <div className={ loaderStyle }>
      <img src={ Orbit } className={ Style.orbit } alt='Orbit Spinner'/>
    </div>    
  );
}