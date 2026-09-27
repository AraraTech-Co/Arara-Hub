import React from 'react';
import { useState } from 'react';
import { Label, ClassHelper } from 'components/lib';
import Style from './switch.tailwind';

export function Switch(props){

  // state
  const [on, setOn] = useState<any>(props.default); // TODO: Type this // TODO: Type this

  function toggle(){

    setOn(!on);
    props.onChange(props.name, !on, true);

  }

  const trackStyle = ClassHelper(Style, {

    track: true, 
    trackOn: on,
    trackOff: !on

  });
    
  const handleStyle = ClassHelper(Style, {
    
    handle: true, 
    handleOn: on,
    handleOff: !on

  });

  return(
    <div className={ Style.switch }>

      <Label
        text={ props.label }
        required={ props.required }
        className={ Style.label }
      />

      <div className={ trackStyle } onClick={ toggle } >
        <div className={ handleStyle }></div>
      </div>
    </div>
  );
}