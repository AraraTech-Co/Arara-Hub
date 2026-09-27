/***
*
*   LIST
*   Ordered or unordered list
*
*   PROPS
*   ordered: true/false
*   items: array of string values
*
**********/

import './list.scss';

export function List(props){

  if (!props.items?.length)
    return false;

  if (props.ordered){
    return (
      <ol className='list'>
        { props.items.map((item, index) => {

            return <li key={ item }>{ item }</li>

         })}
      </ol>
    );
  }

  return (
    <ul className='list'>
      { props.items.map((item, index) => {

        return <li key={ item }>{ item }</li>

      })}
    </ul>
  );
}
