/***
*
*   GRID
*   Responsive one-to-six column grid layout
*
*   PROPS
*   cols: number of columns (default: 2, max: 6)
*
**********/

import { ClassHelper } from 'components/lib';
import Style from './grid.module.scss';

export function Grid(props){

  const cols = {}
  const colNames = ['one', 'two', 'three', 'four', 'five', 'six'];

  if (props.cols){

    for (let i = 0; i < parseInt(props.cols); i++)
      cols[colNames[i]] = true;

  }

  const css = ClassHelper(Style, {...cols, ...{ grid: true }});

  return(
    <section className={ css }>
      { props.children?.length > 1 ?
        props.children.map((child, index) => {

          return child

        }) : props.children
      }
    </section>
  );
}