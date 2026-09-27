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

import "./list.scss";

type ListProps = {
  ordered?: boolean;
  items: string[];
};

export function List(props: ListProps) {
  if (!props.items?.length) return null;

  if (props.ordered) {
    return (
      <ol className="list">
        {props.items.map((item, index) => {
          return <li key={item}>{item}</li>;
        })}
      </ol>
    );
  }

  return (
    <ul className="list">
      {props.items.map((item, index) => {
        return <li key={item}>{item}</li>;
      })}
    </ul>
  );
}
