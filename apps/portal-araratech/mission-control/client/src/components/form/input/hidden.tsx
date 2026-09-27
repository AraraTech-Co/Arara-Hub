import React from 'react';
export function HiddenInput(props){

  return(
    <input
      type='hidden'
      id={ props.name }
      name={ props.name }
      value={ props.value || '' }
    />
  );
}
