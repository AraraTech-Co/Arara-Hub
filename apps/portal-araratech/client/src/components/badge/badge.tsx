
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

import { ClassHelper } from "@/components/lib";
import Style from "./badge.tailwind";

type Props = {
  color: "red" | "blue" | "green" | "orange";
  text: any;
  className?: string;
}

export function Badge(props: Props) {
  const badgeStyle = ClassHelper(Style, {
    [props.color]: true,
    className: props.className,
  });

  return <span className={badgeStyle}>{props.text}</span>;
}
