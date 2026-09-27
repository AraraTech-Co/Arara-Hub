/***
*
*   ERROR
*   Form error message renders below input
*
**********/

import { ClassHelper } from 'components/lib';
import Style from './error.tailwind';

export function Error(props){

  const errorStyle = ClassHelper(Style, props);

  return (
    <div className={ errorStyle }>
      { props.message }
    </div>
  )
}