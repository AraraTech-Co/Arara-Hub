import React from 'react';
import { Icon } from 'components/lib';
import Style from './helper.tailwind';

export function Helper(props){

  return (
    <div className={ Style.helper }>

      <Icon 
        image='help-circle' 
        color='#73B0F4' 
        size={ 20 } 
        className={ Style.icon }
       />

       { props.url ? 
        <a href={ props.url } className={ Style.link }>
          {  props.text }
        </a> :
        <span>{ props.text }</span>
       }

    </div>
  );
}