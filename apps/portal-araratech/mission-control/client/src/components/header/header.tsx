/***
*
*   HEADER
*   Header section with title used in main application (can render children)
*
*   PROPS
*   title: title of the view
*   children: children to render (optional)
*
**********/

import Style from './header.module.scss';

export function Header(props){

  return (
    <header className={ Style.header }>

      { props.title && <h1>{ props.title }</h1> }
      { props.children }

    </header>

  );
}
