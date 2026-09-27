/***
 *
 *   BADGE
 *   Text badge with background color
 *
 *   PROPS
 *   text: string to be displayed
 *   color: blue/red/green/orange (default: purple)
 *
 **********/

import { ClassHelper } from "components/lib";
import Style from "./badge.tailwind";

export function Badge(props) {
  const badgeStyle = ClassHelper(Style, {
    [props.color]: true,
    className: props.className,
  });

  return <span className={badgeStyle}>{props.text}</span>;
}
