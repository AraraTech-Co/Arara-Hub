import React from 'react';
/***
*
*   ICON
*   Render an icon from feather icons
*
*   PROPS
*   color: dark/light/grey/green/orange/blue or hex code
*   pack: icon pack to use, default is feathericons
*   image: image to use (see: https://feathericons.com)
*   className: inject a parent class object
*
**********/

import FeatherIcon from 'feather-icons-react';

export function Icon(props){

  let color;
  
  switch (props.color){

    case 'light':
    color = '#FFFFFF';
    break;

    case 'dark':
    color = '#758197';
    break;

    case 'grey':
    color = '#ccc';
    break;

    case 'green':
    color = '#8CC57D';
    break;

    case 'blue':
    color = '#73B0F4';
    break;
    
    case 'orange':
    color = '#F0AA61'
    break;

    case 'red':
    color = '#d95565';
    break;

    case 'purple':
    color = '#6363AC';
    break;

    default:
    color = props.color;
    break;

  }

  return(
    <FeatherIcon
      color={ color }
      icon={ props.image }
      size={ props.size || 16 }
      className={ props.className }
    />
  )
}

