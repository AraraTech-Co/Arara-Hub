/***
 *
 *   LINK
 *   Routes a new view within the application router
 *   Use this instead of <a> to avoid reloading the page
 *
 *   PROPS
 *   url: the destination as defined in /app/app.js
 *   title: link title
 *   text: link text
 *   btn: display a button
 *   small: display a small button
 *   className: apply a custom css class
 *
 **********/

import { NavLink } from "react-router-dom";
import { ClassHelper } from "@/components/lib";
import Style from "./link.tailwind";

type LinkProps = {
  url: string;
  title?: string;
  text?: string;
  color?: string;
  className?: string;
  children?: React.ReactNode;
};

export function Link(props: LinkProps) {
  const linkStyle = ClassHelper(Style, {
    white: props.color === "white",
    dark: props.color === "dark",
    defaultColor: !props.color,
    className: props.className,
  });

  if (props?.url?.includes("http")) {
    return (
      <a href={props.url} title={props.title} className={linkStyle}>
        {props.text}
      </a>
    );
  }

  return (
    <NavLink
      to={props.url}
      className={linkStyle}
      title={props.title}
      // TODO: Fix this, whatever this is
      // @ts-ignore
      activeclassname="active"
    >
      {props.children || props.text}
    </NavLink>
  );
}
