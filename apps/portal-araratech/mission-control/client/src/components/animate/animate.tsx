/***
*
*   ANIMATE
*   Wrapper component to animate in children
*
*   PROPS
*   type: slideup, slidedown, pop (default: slideup)
*   timeout: timeout (optional, default: 300)
*   children: children to render
*
**********/

import { CSSTransition } from 'react-transition-group';
import './animate.scss';

export function Animate(props){

  const type = props.type || 'slideup';

  return (
    <CSSTransition
      in appear
      timeout={ props.timeout || 300 }
      classNames={ `animate ${type}` }>

        <div className={ `animate ${type}` }>
          { props.children }
        </div>

    </CSSTransition>
  )
}
