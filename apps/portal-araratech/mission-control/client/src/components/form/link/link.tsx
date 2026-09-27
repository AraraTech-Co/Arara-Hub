import React from 'react';
import { Link } from 'components/lib';
import Style from './link.tailwind';

export function FormLink(props){

  return (
    <Link 
      url={ props.url } 
      text={ props.text } 
      className={ Style.link }
    />
  );
}