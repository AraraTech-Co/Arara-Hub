import React from 'react';
/***
*
*   MODAL
*   Display an overlay modal anywhere in your application by calling
*   context.modal.show() with an object containing the following props
*
*   PROPS
*   title: (optional)
*   text: message to the user (optional)
*   form: a form object (optional: see form docs for more information)
*   url: destination to send the form
*   method: HTTP post type
*   buttonText – text for the confirm button
*
**********/

import { useContext } from 'react';
import { ViewContext, Card, Form } from 'components/lib';
import { CSSTransition } from 'react-transition-group';
import './modal.scss';

export function Modal(props){

  const context = useContext(ViewContext);

  return (
   <CSSTransition in appear timeout={ 0 } classNames='modal'>
      <div className='modal'
        onClick={(e) => e.target === e.currentTarget && context.modal.hide(true)}>

        <div className='modal-content'>
          <Card title={ props.title }>

            { props.text &&
              <p>{ props.text }</p> }

            { props.form &&
              <Form
                method={ props.method }
                url={ props.url }
                inputs={ props.form }
                destructive={ props.destructive }
                buttonText={ props.buttonText }
                cancel={ e => context.modal.hide(true) }
              />
            }
          </Card>
        </div>
      </div>
    </CSSTransition>
  );
}
