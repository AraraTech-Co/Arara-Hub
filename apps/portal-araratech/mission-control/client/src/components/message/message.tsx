import React from 'react';
/***
*
*   MESSAGE
*   Colored feedback message with optional call to action
*
*   PROPS
*   type - info/success/warning/error
*   title - descriptive string
*   text - string
*   closable - boolean to determine if the user can close the message
*   buttonText - text for the cta button (optional)
*   buttonLink - url link for the button (optional)
*
**********/

import { useState } from 'react';
import { Button, Icon, useNavigate, ClassHelper } from 'components/lib';
import Style from './message.tailwind';

export function Message(props){

  const navigate = useNavigate();

  // state
  const [closed, setClosed] = useState<any>(false); // TODO: Type this // TODO: Type this
  const type = props.type || 'info';

  if (closed)
    return false;

  const icon = {

    info: 'info',
    success: 'check',
    warning: 'alert-triangle',
    error: 'alert-octagon'

  };

  const color = {

    info: 'blue',
    success: 'green',
    warning: 'orange',
    error: 'red'

  }

  // style
  const messageStyle = ClassHelper(Style, { 
    
    message: true,
    [`${color[type]}Bg`]: true,
    className: props.className, 
  
  });

  const titleStyle = ClassHelper(Style, {

    title: true,
    [`${color[type]}Text`]: true 
    
  });

  return (
    <div className= { messageStyle }>

      <Icon
        className={ Style.icon }
        size={ 30 }
        color={ color[type] }
        image={ icon[type] }
      />

      { props.closable &&
        <Button
          icon='x'
          position='absolute'
          className={ Style.close }
          action={ e => setClosed(true) }
        />
      }

      <section className={ Style.content }>

        { props.title && 
          <h1 className={ titleStyle }>
            { props.title }
          </h1> }
        
        { props.text && 
          <p>{ props.text }</p> }

        { props.children &&
          props.children }

        { props.buttonLink &&
          <Button
            className={ Style.btn }
            color={ color[type] }
            text={ props.buttonText }
            action={ e => navigate(props.buttonLink) }
          />
        }

     </section>
    </div>
  );
}