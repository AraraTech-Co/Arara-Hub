/***
 *
 *   CHECKLIST
 *   Ltems with X or ✓
 *
 *   PROPS
 *   items: array of objects containing keys: name (string) and checked (bool)
 *
 **********/

import { ClassHelper } from "@/components/lib";
import Style from "./checklist.tailwind";

export function CheckList(props) {
  if (!props.items) return <div>No items in list</div>;

  const checklistStyle = ClassHelper(Style, {
    checklist: true,
    className: props.className,
  });

  return (
    <ul className={checklistStyle}>
      {props.items.map((item, index) => {
        item.style = ClassHelper(Style, {
          item: true,
          checkGreen: item.checked && !props.color,
          checkWhite: item.checked && props.color === "white",
          cross: !props.hideCross && !item.checked,
          interactive: props.interactive,
        });

        return (
          <li onClick={item.onClick} className={item.style} key={index}>
            {item.name}
          </li>
        );
      })}
    </ul>
  );
}
