/***
*
*   HEADER
*   Use as section break in a form
*
*   PROPS
*   title: string
*   label: optional description label
*
**********/

import Style from './header.tailwind';

export function FormHeader(props){

  return(
    <header className={ Style.header }>

      { props.title && 
        <h2>{ props.title } </h2> }

      { props.label && 
        <p className={ Style.label }>
         { props.label }
        </p> 
      }

    </header>
  );
}