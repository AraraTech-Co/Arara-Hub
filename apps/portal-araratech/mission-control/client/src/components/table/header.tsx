import { useState } from 'react';
import { ClassHelper } from 'components/lib';
import Style from './table.tailwind';

export function Header(props){

  // initialise
  let data = [...props.data]
  let colLength = data?.length ? data.length-1 : 0;

  // state
  const [sortDirections, setSortDirections] = useState<any>(new Array(colLength)); // TODO: Type this // TODO: Type this

  if (!data)
    return false;

  // inject actions
  if (props.actions && props.data[colLength]?.name)
    data.push({ name: 'actions', title: 'Actions', sort: false });

  // sort the columns
  function sort(index, cell){

    if (!props.data[index].sort)
      return false;

    const direction =
      sortDirections[index] === 'asc' ? 'desc' : 'asc';

    // reset sorting on all columns
    let sorted = new Array(colLength)
    sorted[index] = direction;

    // done
    props.callback(cell, direction);
    setSortDirections(sorted)

  }

  return(
    <thead className={ Style.thead }>
      <tr>
        { data.map((cell, index) => {

          // hide
          if (props.hide?.includes(cell.name))
            return false;

          // show
          if (props.show && !props.show.includes(cell.name) && cell.name !== 'actions')
            return false;

          // style
          const css = ClassHelper(Style, {

            th: true,
            sort: cell.sort,
            th_actions: cell.name === 'actions',
            asc: sortDirections[index] === 'asc',
            desc: sortDirections[index] === 'desc'

          });

          return (
            <th
              key={ index }
              className={ css }
              onClick={ () => cell.sort && sort(index, cell.name) }>
              { cell.title }
            </th>
          );
        })}
      </tr>
    </thead>
  );
}